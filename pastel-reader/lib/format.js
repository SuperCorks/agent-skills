function toMarkdown({ metadata, canvas, comments }) {
  const lines = [];
  const title = canvas?.name || canvas?.title ? `Pastel Comments: ${canvas.name || canvas.title}` : `Pastel Comments: ${metadata.canvasId}`;
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`Fetched: ${metadata.fetchedAt}`);
  lines.push(`Comments: ${comments.length}`);
  lines.push('');

  comments.forEach((comment, index) => {
    const heading = comment.comment ? firstLine(comment.comment) : comment.id;
    lines.push(`## ${index + 1}. ${heading}`);
    lines.push('');
    lines.push(`- ID: ${comment.id}`);
    if (comment.number !== null && comment.number !== undefined) lines.push(`- Number: ${comment.number}`);
    if (comment.status) lines.push(`- Status: ${comment.status}`);
    if (comment.userName || comment.userEmail) {
      const author = comment.userEmail ? `${comment.userName || ''} <${comment.userEmail}>`.trim() : comment.userName;
      lines.push(`- Author: ${author}`);
    }
    if (comment.createdAt) lines.push(`- Created: ${comment.createdAt}`);
    if (comment.updatedAt) lines.push(`- Updated: ${comment.updatedAt}`);
    if (comment.isPrivate) lines.push('- Visibility: private/team');
    if (comment.assignedUserId) lines.push(`- Assigned user: ${comment.assignedUserId}`);
    if (comment.pageUrl || comment.path) lines.push(`- Page: ${comment.pageUrl || comment.path}`);
    if (comment.fullCommentUrl) lines.push(`- Comment URL: ${comment.fullCommentUrl}`);
    if (comment.screenshotUrl) lines.push(`- Screenshot: ${comment.screenshotUrl}`);
    if (comment.labels.length) lines.push(`- Labels: ${comment.labels.map((label) => label.name || label.id).join(', ')}`);
    if (comment.fileAttachments.length) lines.push(`- Attachments: ${comment.fileAttachments.map((file) => file.name || file.id).join(', ')}`);
    lines.push('');
    if (comment.comment) {
      lines.push(comment.comment);
      lines.push('');
    }
    if (comment.replies.length) {
      lines.push('Replies:');
      for (const reply of comment.replies) {
        const author = reply.userName || reply.userEmail || reply.UserId || 'unknown';
        lines.push(`- ${author}: ${reply.comment || ''}`);
      }
      lines.push('');
    }
  });

  return lines.join('\n');
}

function toCsv(comments) {
  const headers = [
    'id',
    'number',
    'canvasId',
    'status',
    'isPrivate',
    'author',
    'comment',
    'createdAt',
    'updatedAt',
    'pageUrl',
    'commentUrl',
    'screenshotUrl',
    'labels',
    'assignedUserId',
    'replyCount',
  ];

  const rows = comments.map((comment) => [
    comment.id,
    comment.number,
    comment.CanvasId,
    comment.status,
    comment.isPrivate,
    comment.userName || comment.userEmail || comment.UserId,
    comment.comment,
    comment.createdAt,
    comment.updatedAt,
    comment.pageUrl || comment.path,
    comment.fullCommentUrl,
    comment.screenshotUrl,
    comment.labels.map((label) => label.name || label.id).join('; '),
    comment.assignedUserId,
    comment.replies.length,
  ]);

  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

function csvEscape(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (!/[",\n\r]/.test(stringValue)) {
    return stringValue;
  }
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function firstLine(value) {
  return String(value).split(/\r?\n/)[0].slice(0, 90);
}

module.exports = {
  toMarkdown,
  toCsv,
};
