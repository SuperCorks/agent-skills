// Deterministic API transport used only by subprocess tests through --import.
globalThis.fetch = async (url, request) => {
  if (url !== 'https://api.fireflies.ai/graphql' || request.headers.Authorization !== 'Bearer fixture-key') {
    throw new Error('Unexpected API request.');
  }
  const { query } = JSON.parse(request.body);
  const meeting = {
    id: 'fixture-meeting', title: 'Pricing discussion', date: 1791988200000,
    duration: 12, transcript_url: 'https://app.fireflies.ai/view/fixture-meeting',
    meeting_info: { summary_status: 'processed' },
    summary: { overview: 'Discussed pricing.', action_items: 'Jamie: prepare options.' },
    sentences: [
      { index: 0, speaker_name: 'Jamie', text: 'Prepare pricing options.', start_time: 10, end_time: 13 },
      { index: 1, speaker_name: 'Alex', text: 'Review them tomorrow.', start_time: 14, end_time: 17 },
    ],
  };
  const data = query.includes('user {') ? { user: { email: 'owner@example.com', name: 'Owner' } }
    : query.includes('transcripts(') ? { transcripts: [meeting] } : { transcript: meeting };
  return new Response(JSON.stringify({ data }), { status: 200 });
};
