const { generateAdminToken, generateGuestClientToken } = require("./auth");
const { getAdminUrl, getClientUrl } = require("./endpoints");
const { executeGraphQL, formatErrors, hasErrors, sleep } = require("./graphql");
const { fetchAllPages } = require("./pagination");

const GET_LOCATIONS_QUERY = `
  query GetLocations($first: Int!, $after: String) {
    business {
      locations(first: $first, after: $after) {
        edges {
          node {
            id
            name
            tz
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

const CREATE_CART_MUTATION = `
  mutation CreateCart($input: CreateCartInput!) {
    createCart(input: $input) {
      cart {
        id
        location {
          id
          name
          tz
        }
        availableCategories {
          id
          name
          availableItems {
            __typename
            ... on CartAvailableBookableItem {
              id
              name
              disabled
              listPriceRange {
                min
                max
              }
            }
          }
        }
      }
    }
  }
`;

const ADD_BOOKABLE_ITEM_MUTATION = `
  mutation AddCartSelectedBookableItem($input: AddCartSelectedBookableItemInput!) {
    addCartSelectedBookableItem(input: $input) {
      cart {
        id
        summary {
          total
        }
      }
    }
  }
`;

const GET_BOOKABLE_DATES_QUERY = `
  query GetCartBookableDates($id: ID!, $searchRangeLower: Date, $searchRangeUpper: Date, $tz: Tz) {
    cartBookableDates(
      id: $id
      searchRangeLower: $searchRangeLower
      searchRangeUpper: $searchRangeUpper
      tz: $tz
    ) {
      date
    }
  }
`;

const GET_BOOKABLE_TIMES_QUERY = `
  query GetCartBookableTimes($id: ID!, $searchDate: Date!, $tz: Tz) {
    cartBookableTimes(id: $id, searchDate: $searchDate, tz: $tz) {
      id
      startTime
    }
  }
`;

const RESERVE_BOOKABLE_ITEMS_MUTATION = `
  mutation ReserveCartBookableItems($input: ReserveCartBookableItemsInput!) {
    reserveCartBookableItems(input: $input) {
      cart {
        id
        startTime
        startTimeId
        errors {
          code
          message
        }
      }
    }
  }
`;

const UPDATE_CART_MUTATION = `
  mutation UpdateCart($input: UpdateCartInput!) {
    updateCart(input: $input) {
      cart {
        id
        clientInformation {
          firstName
          lastName
          email
          phoneNumber
        }
        errors {
          code
          message
        }
      }
    }
  }
`;

const CHECKOUT_CART_MUTATION = `
  mutation CheckoutCart($input: CheckoutCartInput!) {
    checkoutCart(input: $input) {
      appointments {
        appointmentId
        clientId
        forCartOwner
      }
      cart {
        id
        completedAt
        startTime
        summary {
          total
        }
        errors {
          code
          message
        }
      }
    }
  }
`;

const GET_ADMIN_APPOINTMENT_QUERY = `
  query GetAppointment($id: ID!) {
    appointment(id: $id) {
      id
      startAt
      cancelled
      client {
        id
        firstName
        lastName
        email
      }
      location {
        id
        name
      }
      appointmentServices {
        service {
          id
          name
        }
      }
    }
  }
`;

const LIST_ADMIN_APPOINTMENTS_QUERY = `
  query ListAppointments($locationId: ID!, $query: QueryString, $first: Int!, $after: String) {
    appointments(locationId: $locationId, query: $query, first: $first, after: $after) {
      edges {
        node {
          id
          startAt
          cancelled
          client {
            id
            firstName
            lastName
            email
          }
          location {
            id
            name
          }
          appointmentServices {
            service {
              id
              name
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const CANCEL_APPOINTMENT_MUTATION = `
  mutation CancelAppointment($input: CancelAppointmentInput!) {
    cancelAppointment(input: $input) {
      appointment {
        id
        cancelled
        startAt
      }
    }
  }
`;

function createClientContext({ env, businessId, apiKey }) {
  return {
    env,
    businessId,
    apiKey,
    url: getClientUrl(env, businessId),
    authToken: generateGuestClientToken(apiKey),
  };
}

function createAdminContext({ env, businessId, apiKey, apiSecret }) {
  return {
    env,
    businessId,
    apiKey,
    apiSecret,
    url: getAdminUrl(env),
    authToken: generateAdminToken(businessId, apiKey, apiSecret),
  };
}

async function executeRequiredGraphql(context, query, variables = {}, options = {}) {
  const response = await executeGraphQL(context.url, context.authToken, query, variables, options);
  if (hasErrors(response)) {
    const error = new Error(formatErrors(response.errors));
    error.response = response;
    throw error;
  }

  return response.data;
}

function normalizeForMatch(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesName(value, matcher, exact = false) {
  if (!matcher) {
    return true;
  }

  const haystack = normalizeForMatch(value);
  const needle = normalizeForMatch(matcher);
  return exact ? haystack === needle : haystack.includes(needle);
}

function locationMatches(location, options = {}) {
  return matchesName(location.name, options.locationName, options.locationExact);
}

function itemMatches(item, options = {}) {
  if (!matchesName(item.itemName, options.serviceName, options.serviceExact)) {
    return false;
  }

  if (options.zeroDollarOnly && item.minPrice !== 0) {
    return false;
  }

  return true;
}

async function fetchLocations(clientContext, options = {}) {
  const locations = await fetchAllPages({
    url: clientContext.url,
    authToken: clientContext.authToken,
    queryTemplate: GET_LOCATIONS_QUERY,
    connectionPath: "business.locations",
    options,
  });

  return locations;
}

async function resolveLocations(clientContext, options = {}) {
  const locations = await fetchLocations(clientContext, { verbose: options.verbose });
  const filteredLocations = locations.filter((location) => locationMatches(location, options));

  if (filteredLocations.length === 0) {
    throw new Error(
      options.locationName
        ? `No locations matched "${options.locationName}".`
        : "No Boulevard locations were returned.",
    );
  }

  return filteredLocations;
}

async function fetchBookableItemsForLocation(clientContext, location, options = {}) {
  const data = await executeRequiredGraphql(
    clientContext,
    CREATE_CART_MUTATION,
    { input: { locationId: location.id } },
    { verbose: options.verbose },
  );

  const categories = data.createCart?.cart?.availableCategories ?? [];
  const items = categories.flatMap((category) =>
    (category.availableItems ?? [])
      .filter((item) => item.__typename === "CartAvailableBookableItem" && !item.disabled)
      .map((item) => ({
        locationId: location.id,
        locationName: location.name,
        locationTz: location.tz,
        categoryName: category.name,
        itemId: item.id,
        itemName: item.name,
        minPrice: item.listPriceRange?.min ?? undefined,
        maxPrice: item.listPriceRange?.max ?? undefined,
      })),
  );

  return items.filter((item) => itemMatches(item, options));
}

async function listBookableItems(clientContext, options = {}) {
  const locations = await resolveLocations(clientContext, options);
  const results = [];

  for (const location of locations) {
    const items = await fetchBookableItemsForLocation(clientContext, location, options);
    results.push(...items);
    if (options.progress) {
      options.progress({
        stage: "items",
        locationName: location.name,
        locationId: location.id,
        itemCount: items.length,
      });
    }
  }

  return results;
}

async function discoverAvailability(clientContext, options = {}) {
  if (!options.date) {
    throw new Error("discoverAvailability requires a date.");
  }

  const locations = await resolveLocations(clientContext, options);
  const availability = [];
  let checkedItemCount = 0;

  for (const location of locations) {
    const items = await fetchBookableItemsForLocation(clientContext, location, options);
    if (options.progress) {
      options.progress({
        stage: "discover-location",
        locationName: location.name,
        locationId: location.id,
        itemCount: items.length,
      });
    }

    for (const item of items) {
      checkedItemCount += 1;

      const cartData = await executeRequiredGraphql(
        clientContext,
        CREATE_CART_MUTATION,
        { input: { locationId: location.id } },
        { verbose: options.verbose },
      );
      const cartId = cartData.createCart?.cart?.id;
      if (!cartId) {
        throw new Error(`CreateCart did not return a cart ID for ${location.name}.`);
      }

      await executeRequiredGraphql(
        clientContext,
        ADD_BOOKABLE_ITEM_MUTATION,
        {
          input: {
            id: cartId,
            itemId: item.itemId,
          },
        },
        { verbose: options.verbose },
      );

      const datesData = await executeRequiredGraphql(
        clientContext,
        GET_BOOKABLE_DATES_QUERY,
        {
          id: cartId,
          searchRangeLower: options.date,
          searchRangeUpper: options.date,
          tz: location.tz,
        },
        { verbose: options.verbose },
      );

      const hasDate = (datesData.cartBookableDates ?? []).some((entry) => entry.date === options.date);
      if (!hasDate) {
        continue;
      }

      const timesData = await executeRequiredGraphql(
        clientContext,
        GET_BOOKABLE_TIMES_QUERY,
        {
          id: cartId,
          searchDate: options.date,
          tz: location.tz,
        },
        { verbose: options.verbose },
      );

      const times = timesData.cartBookableTimes ?? [];
      if (times.length === 0) {
        continue;
      }

      availability.push({
        ...item,
        date: options.date,
        times,
      });

      if (options.progress) {
        options.progress({
          stage: "discover-match",
          locationName: location.name,
          itemName: item.itemName,
          slotCount: times.length,
        });
      }

      if (options.delayMs) {
        await sleep(options.delayMs);
      }
    }
  }

  return {
    checkedItemCount,
    availability,
  };
}

function buildClientInfo(index, options = {}) {
  const firstName = options.clientFirstName || "Codex";
  const lastNamePrefix = options.clientLastNamePrefix || "Booking";
  const emailPrefix = options.clientEmailPrefix || "codex-blvd";
  const emailDomain = options.clientEmailDomain || "example.com";

  return {
    firstName,
    lastName: `${lastNamePrefix} ${String(index).padStart(4, "0")}`,
    email: `${emailPrefix}-${String(index).padStart(4, "0")}@${emailDomain}`,
    phoneNumber: options.clientPhone || "5555550101",
  };
}

async function bookAvailability(clientContext, adminContext, availability, options = {}) {
  const dryRun = options.dryRun !== false;
  const limit = options.limit ?? undefined;
  const delayMs = options.delayMs ?? 150;
  const attempts = [];
  let bookingIndex = options.startIndex ?? 1;

  const slots = availability.flatMap((item) =>
    item.times.map((time) => ({
      ...item,
      bookableTimeId: time.id,
      startTime: time.startTime,
    })),
  );
  const targetedSlots = limit ? slots.slice(0, limit) : slots;

  for (const slot of targetedSlots) {
    if (options.progress) {
      options.progress({
        stage: "book-attempt",
        locationName: slot.locationName,
        itemName: slot.itemName,
        startTime: slot.startTime,
      });
    }

    const clientInfo = buildClientInfo(bookingIndex, options);
    const attempt = {
      locationName: slot.locationName,
      itemName: slot.itemName,
      startTime: slot.startTime,
      clientInformation: clientInfo,
    };

    if (dryRun) {
      attempt.status = "dry-run";
      attempts.push(attempt);
      bookingIndex += 1;
      continue;
    }

    try {
      const cartData = await executeRequiredGraphql(
        clientContext,
        CREATE_CART_MUTATION,
        { input: { locationId: slot.locationId } },
        { verbose: options.verbose },
      );
      const cartId = cartData.createCart?.cart?.id;
      if (!cartId) {
        throw new Error("CreateCart did not return a cart ID.");
      }

      attempt.cartId = cartId;

      await executeRequiredGraphql(
        clientContext,
        ADD_BOOKABLE_ITEM_MUTATION,
        {
          input: {
            id: cartId,
            itemId: slot.itemId,
          },
        },
        { verbose: options.verbose },
      );

      await executeRequiredGraphql(
        clientContext,
        RESERVE_BOOKABLE_ITEMS_MUTATION,
        {
          input: {
            id: cartId,
            bookableTimeId: slot.bookableTimeId,
          },
        },
        { verbose: options.verbose },
      );

      await executeRequiredGraphql(
        clientContext,
        UPDATE_CART_MUTATION,
        {
          input: {
            id: cartId,
            clientInformation: clientInfo,
          },
        },
        { verbose: options.verbose },
      );

      const checkoutData = await executeRequiredGraphql(
        clientContext,
        CHECKOUT_CART_MUTATION,
        {
          input: {
            id: cartId,
          },
        },
        { verbose: options.verbose },
      );

      const appointmentId = checkoutData.checkoutCart?.appointments?.[0]?.appointmentId;
      attempt.appointmentId = appointmentId ?? undefined;

      if (!appointmentId) {
        attempt.status = "checked-out-without-appointment";
        attempt.checkoutCart = checkoutData.checkoutCart?.cart;
      } else {
        const appointmentData = await executeRequiredGraphql(
          adminContext,
          GET_ADMIN_APPOINTMENT_QUERY,
          { id: appointmentId },
          { verbose: options.verbose },
        );
        attempt.status = "booked";
        attempt.appointment = appointmentData.appointment;
      }
    } catch (error) {
      attempt.status = "failed";
      attempt.error = error.message;
      if (error.response?.data) {
        attempt.partialData = error.response.data;
      }
    }

    attempts.push(attempt);
    bookingIndex += 1;

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return attempts;
}

function getOffsetMilliseconds(timeZone, date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const reconstructedUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return reconstructedUtc - date.getTime();
}

function toUtcIsoFromLocalDateTime(dateString, timeString, timeZone) {
  const [year, month, day] = dateString.split("-").map((value) => Number(value));
  const [hour, minute, second = 0] = timeString.split(":").map((value) => Number(value));

  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  for (let i = 0; i < 3; i += 1) {
    const offsetMilliseconds = getOffsetMilliseconds(timeZone, candidate);
    const resolved = new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offsetMilliseconds);
    if (resolved.getTime() === candidate.getTime()) {
      break;
    }
    candidate = resolved;
  }

  return candidate.toISOString();
}

function addDays(dateString, dayCount) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayCount);
  return date.toISOString().slice(0, 10);
}

function buildAppointmentRangeQuery(dateString, timeZone) {
  const startAt = toUtcIsoFromLocalDateTime(dateString, "00:00:00", timeZone);
  const endAt = toUtcIsoFromLocalDateTime(addDays(dateString, 1), "00:00:00", timeZone);
  return `startAt >= '${startAt}' AND startAt < '${endAt}' AND cancelled = false`;
}

async function listAppointmentsForDate(adminContext, location, options = {}) {
  const query = buildAppointmentRangeQuery(options.date, location.tz);
  const appointments = await fetchAllPages({
    url: adminContext.url,
    authToken: adminContext.authToken,
    queryTemplate: LIST_ADMIN_APPOINTMENTS_QUERY,
    connectionPath: "appointments",
    extraVariables: {
      locationId: location.id,
      query,
    },
    options: {
      verbose: options.verbose,
    },
  });

  return appointments.filter((appointment) => {
    const serviceNames = (appointment.appointmentServices ?? []).map((service) => service.service?.name || "");
    const serviceMatches =
      !options.serviceName ||
      serviceNames.some((serviceName) => matchesName(serviceName, options.serviceName, options.serviceExact));

    const clientEmail = appointment.client?.email || "";
    const emailMatches = !options.clientEmailPrefix
      ? true
      : normalizeForMatch(clientEmail).startsWith(normalizeForMatch(options.clientEmailPrefix));

    return serviceMatches && emailMatches;
  });
}

async function cancelAppointments(adminContext, appointments, options = {}) {
  const dryRun = options.dryRun !== false;
  const attempts = [];

  for (const appointment of appointments) {
    if (options.progress) {
      options.progress({
        stage: "cancel-attempt",
        appointmentId: appointment.id,
        startTime: appointment.startAt,
        itemName: appointment.appointmentServices?.[0]?.service?.name || "Unknown service",
      });
    }

    const attempt = {
      appointmentId: appointment.id,
      startTime: appointment.startAt,
      clientEmail: appointment.client?.email || undefined,
      itemNames: (appointment.appointmentServices ?? [])
        .map((service) => service.service?.name)
        .filter(Boolean),
    };

    if (dryRun) {
      attempt.status = "dry-run";
      attempts.push(attempt);
      continue;
    }

    try {
      const response = await executeRequiredGraphql(
        adminContext,
        CANCEL_APPOINTMENT_MUTATION,
        {
          input: {
            id: appointment.id,
            notes: options.notes || "Cancelled by Codex Boulevard cleanup script.",
            notifyClient: options.notifyClient === true,
            reason: options.reason || "MISTAKE",
          },
        },
        { verbose: options.verbose },
      );

      attempt.status = "cancelled";
      attempt.appointment = response.cancelAppointment?.appointment;
    } catch (error) {
      attempt.status = "failed";
      attempt.error = error.message;
      if (error.response?.data) {
        attempt.partialData = error.response.data;
      }
    }

    attempts.push(attempt);

    if (options.delayMs) {
      await sleep(options.delayMs);
    }
  }

  return attempts;
}

function summarizeAvailability(discoveryResult) {
  const availability = discoveryResult.availability;
  return {
    checkedItemCount: discoveryResult.checkedItemCount,
    bookableItemCount: availability.length,
    slotCount: availability.reduce((sum, item) => sum + item.times.length, 0),
    items: availability.map((item) => ({
      locationName: item.locationName,
      itemName: item.itemName,
      categoryName: item.categoryName,
      minPrice: item.minPrice,
      maxPrice: item.maxPrice,
      slotCount: item.times.length,
      firstTime: item.times[0]?.startTime,
      lastTime: item.times.at(-1)?.startTime,
    })),
  };
}

function summarizeBookingAttempts(attempts) {
  const booked = attempts.filter((attempt) => attempt.status === "booked");
  const failed = attempts.filter((attempt) => attempt.status === "failed");
  const dryRun = attempts.filter((attempt) => attempt.status === "dry-run");

  const bookedByItem = {};
  for (const attempt of booked) {
    bookedByItem[attempt.itemName] = (bookedByItem[attempt.itemName] || 0) + 1;
  }

  const failureReasons = {};
  for (const attempt of failed) {
    failureReasons[attempt.error] = (failureReasons[attempt.error] || 0) + 1;
  }

  return {
    attemptedSlots: attempts.length,
    bookedCount: booked.length,
    failedCount: failed.length,
    dryRunCount: dryRun.length,
    bookedByItem,
    failureReasons,
  };
}

module.exports = {
  bookAvailability,
  buildAppointmentRangeQuery,
  cancelAppointments,
  createAdminContext,
  createClientContext,
  discoverAvailability,
  executeRequiredGraphql,
  fetchBookableItemsForLocation,
  fetchLocations,
  listAppointmentsForDate,
  listBookableItems,
  resolveLocations,
  summarizeAvailability,
  summarizeBookingAttempts,
};
