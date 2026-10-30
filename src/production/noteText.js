/*
 * E-181 (10-30, David Balls Deal 1): Zoho returns a note's text with "&" as "&amp;" (and <, >, quotes as entities; line breaks sometimes as
 * <br>). Every reader of a note the cards or forms wrote compares that text with names like "Port & Company ...", so it must decode first.
 * Found when six proof approvals of "Port & Company - Tall Core Fleece ..." never counted. Pure.
 */
const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'", "&apos;": "'", "&nbsp;": " " };
export const decodeEntities = (s) =>
  String(s == null ? "" : s).replace(/&(amp|lt|gt|quot|#39|#x27|apos|nbsp);/g, (m) => ENTITIES[m] || m);
/* A note's text as plain lines: <br> -> line break, entities decoded. */
export const noteText = (n) => decodeEntities(String((n && n.Note_Content) == null ? "" : n.Note_Content).replace(/<br\s*\/?>/gi, "\n"));
