/* Read-only directory accounting using macOS batched file attributes. */
#include <fcntl.h>
#include <inttypes.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/attr.h>
#include <sys/stat.h>
#include <sys/vnode.h>
#include <unistd.h>

enum { BUFFER_SIZE = 64 * 1024 };

typedef struct {
    uint64_t allocated, exclusive, files, private_files, errors, newest;
} Tally;

typedef struct {
    uint64_t *slots;
    size_t capacity, count;
} LinkSet;

typedef struct {
    const unsigned char *next, *end;
} Reader;

typedef struct {
    const char *name;
    uint32_t type, mount_flags, links;
    uint64_t file_id, allocated, exclusive, newest;
    bool has_exclusive;
} Entry;

static bool read_field(Reader *reader, void *field, size_t size) {
    if ((size_t)(reader->end - reader->next) < size) return false;
    memcpy(field, reader->next, size);
    reader->next += size;
    return true;
}

/* Returned attributes appear in the documented Darwin packing order. */
static bool decode(Reader r, Entry *entry) {
    attribute_set_t returned;
    uint32_t error = 0;
    attrreference_t name_ref;
    struct timespec created = {0}, modified = {0};

    if (!read_field(&r, &returned, sizeof(returned))) return false;
#define ATTR(group, bit, field) \
    if ((returned.group & (bit)) && !read_field(&r, &(field), sizeof(field))) return false
    ATTR(commonattr, ATTR_CMN_ERROR, error);
    if (error || !(returned.commonattr & ATTR_CMN_NAME)) return false;
    const unsigned char *reference = r.next;
    if (!read_field(&r, &name_ref, sizeof(name_ref)) || name_ref.attr_dataoffset <= 0 ||
        (size_t)name_ref.attr_dataoffset > (size_t)(r.end - reference)) return false;
    const unsigned char *name = reference + name_ref.attr_dataoffset;
    if (name_ref.attr_length > (size_t)(r.end - name) ||
        !memchr(name, '\0', name_ref.attr_length)) return false;
    entry->name = (const char *)name;

    ATTR(commonattr, ATTR_CMN_OBJTYPE, entry->type);
    ATTR(commonattr, ATTR_CMN_CRTIME, created);
    ATTR(commonattr, ATTR_CMN_MODTIME, modified);
    ATTR(commonattr, ATTR_CMN_FILEID, entry->file_id);
    ATTR(dirattr, ATTR_DIR_MOUNTSTATUS, entry->mount_flags);
    ATTR(fileattr, ATTR_FILE_LINKCOUNT, entry->links);
    ATTR(fileattr, ATTR_FILE_ALLOCSIZE, entry->allocated);
    ATTR(forkattr, ATTR_CMNEXT_PRIVATESIZE, entry->exclusive);
#undef ATTR
    if (!entry->type || (entry->type == VREG && !(returned.fileattr & ATTR_FILE_ALLOCSIZE))) return false;
    entry->has_exclusive = (returned.forkattr & ATTR_CMNEXT_PRIVATESIZE) != 0;
    time_t newest = created.tv_sec > modified.tv_sec ? created.tv_sec : modified.tv_sec;
    if (newest > 0) entry->newest = (uint64_t)newest;
    return true;
}

static size_t link_slot(const LinkSet *set, uint64_t id) {
    uint64_t hash = id ^ (id >> 33);
    hash *= UINT64_C(0xff51afd7ed558ccd);
    hash ^= hash >> 33;
    size_t index = hash & (set->capacity - 1);
    while (set->slots[index] && set->slots[index] != id) index = (index + 1) & (set->capacity - 1);
    return index;
}

static bool first_link(LinkSet *set, uint64_t id) {
    if (set->count * 2 >= set->capacity) {
        size_t old_capacity = set->capacity;
        uint64_t *old = set->slots;
        set->capacity = old_capacity ? old_capacity * 2 : 4096;
        set->slots = calloc(set->capacity, sizeof(*set->slots));
        if (!set->slots) { perror("hard-link table"); exit(1); }
        for (size_t i = 0; i < old_capacity; ++i) {
            if (old[i]) set->slots[link_slot(set, old[i])] = old[i];
        }
        free(old);
    }
    size_t index = link_slot(set, id);
    if (set->slots[index]) return false;
    set->slots[index] = id;
    set->count++;
    return true;
}

static void combine(Tally *into, Tally sub) {
    into->allocated += sub.allocated;
    into->exclusive += sub.exclusive;
    into->files += sub.files;
    into->private_files += sub.private_files;
    into->errors += sub.errors;
    if (sub.newest > into->newest) into->newest = sub.newest;
}

static void quoted(const char *path) {
    putchar('"');
    for (const unsigned char *p = (const unsigned char *)path; *p; ++p) {
        if (*p == '"' || *p == '\\') putchar('\\');
        if (*p < 0x20) printf("\\u%04x", (unsigned)*p);
        else putchar(*p);
    }
    putchar('"');
}

static void report(const char *path, unsigned depth, Tally tally) {
    fputs("{\"path\":", stdout);
    quoted(path);
    printf(",\"depth\":%u,\"allocated_bytes\":%" PRIu64 ",\"exclusive_bytes\":", depth, tally.allocated);
    if (tally.private_files == tally.files) printf("%" PRIu64, tally.exclusive);
    else fputs("null", stdout);
    printf(",\"files\":%" PRIu64 ",\"errors\":%" PRIu64 ",\"newest_timestamp\":",
           tally.files, tally.errors);
    if (tally.newest) printf("%" PRIu64, tally.newest);
    else fputs("null", stdout);
    puts("}");
    fflush(stdout);
}

static Tally scan(int fd, const char *path, dev_t device, unsigned depth,
                  unsigned report_depth, LinkSet *seen) {
    Tally total = {0};
    struct stat root;
    if (fstat(fd, &root) != 0) {
        total.errors++;
        if (depth <= report_depth) report(path, depth, total);
        return total;
    }
    if (root.st_dev != device) return total;

    time_t newest = root.st_birthtime > root.st_mtime ? root.st_birthtime : root.st_mtime;
    if (newest > 0) total.newest = (uint64_t)newest;
    unsigned char *buffer = malloc(BUFFER_SIZE);
    if (!buffer) { perror("attribute buffer"); exit(1); }
    struct attrlist attributes = {
        .bitmapcount = ATTR_BIT_MAP_COUNT,
        .commonattr = ATTR_BULK_REQUIRED | ATTR_CMN_ERROR | ATTR_CMN_OBJTYPE |
                      ATTR_CMN_CRTIME | ATTR_CMN_MODTIME | ATTR_CMN_FILEID,
        .dirattr = ATTR_DIR_MOUNTSTATUS,
        .fileattr = ATTR_FILE_LINKCOUNT | ATTR_FILE_ALLOCSIZE,
        .forkattr = ATTR_CMNEXT_PRIVATESIZE,
    };
    int count;
    while ((count = getattrlistbulk(fd, &attributes, buffer, BUFFER_SIZE, FSOPT_ATTR_CMN_EXTENDED)) > 0) {
        const unsigned char *current = buffer;
        for (int i = 0; i < count; ++i) {
            uint32_t length = 0;
            Reader reader = {current, buffer + BUFFER_SIZE};
            if (!read_field(&reader, &length, sizeof(length)) || length < sizeof(length) ||
                length > (size_t)(reader.end - current)) {
                total.errors++;
                break;
            }
            reader.end = current + length;
            current = reader.end;
            Entry entry = {0};
            if (!decode(reader, &entry)) { total.errors++; continue; }
            if (entry.type == VDIR) {
                if (!strcmp(entry.name, ".") || !strcmp(entry.name, "..") ||
                    (entry.mount_flags & DIR_MNTSTATUS_MNTPOINT)) continue;
                int child = openat(fd, entry.name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
                if (child < 0) { total.errors++; continue; }
                char *child_path;
                if (asprintf(&child_path, "%s%s%s", path, !strcmp(path, "/") ? "" : "/", entry.name) < 0) {
                    perror("child path");
                    exit(1);
                }
                combine(&total, scan(child, child_path, device, depth + 1, report_depth, seen));
                free(child_path);
                close(child);
            } else if (entry.type == VREG) {
                if (entry.newest > total.newest) total.newest = entry.newest;
                if (entry.links > 1 && !entry.file_id) { total.errors++; continue; }
                if (entry.links > 1 && !first_link(seen, entry.file_id)) continue;
                total.allocated += entry.allocated;
                total.files++;
                if (entry.has_exclusive) {
                    total.exclusive += entry.exclusive;
                    total.private_files++;
                }
            }
        }
    }
    if (count < 0) total.errors++;
    free(buffer);
    if (depth <= report_depth) report(path, depth, total);
    return total;
}

int main(int argc, char **argv) {
    if (argc < 3) return 2;
    unsigned depth = (unsigned)strtoul(argv[1], NULL, 10);
    int result = 0;
    for (int i = 2; i < argc; ++i) {
        int fd = open(argv[i], O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
        if (fd < 0) { perror(argv[i]); result = 1; continue; }
        struct stat st;
        if (fstat(fd, &st) == 0) {
            LinkSet seen = {0};
            Tally total = scan(fd, argv[i], st.st_dev, 0, depth, &seen);
            free(seen.slots);
            if (total.errors) result = 1;
        } else {
            perror(argv[i]);
            result = 1;
        }
        close(fd);
    }
    return result;
}
