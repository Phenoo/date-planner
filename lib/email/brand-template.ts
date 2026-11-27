import { siteName, siteOrigin, supportEmail } from "@/lib/seo/site";

export type EmailContent = { html: string; text: string };
export type BrandEmailInput = {
  preheader: string;
  eyebrow?: string;
  title: string;
  paragraphs?: readonly string[];
  facts?: readonly { label: string; value: string }[];
  primaryAction?: { label: string; url: string; fallbackLabel?: string };
  secondaryAction?: { label: string; url: string };
  note?: string;
};

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const lines = (value: string) => escapeHtml(value).replace(/\r\n|\r|\n/g, "<br />");

function actionUrl(value: string, origin: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) throw new Error("Email actions must use the configured application origin.");
  return url.href;
}

export function brandEmail(input: BrandEmailInput, actionOrigin = siteOrigin): EmailContent {
  const primary = input.primaryAction ? { ...input.primaryAction, url: actionUrl(input.primaryAction.url, actionOrigin) } : undefined;
  const secondary = input.secondaryAction ? { ...input.secondaryAction, url: actionUrl(input.secondaryAction.url, actionOrigin) } : undefined;
  const paragraphs = (input.paragraphs ?? []).map(paragraph => `<p style="margin:0 0 20px;font-size:17px;line-height:1.75;color:#725d63;overflow-wrap:anywhere;word-break:break-word;">${lines(paragraph)}</p>`).join("");
  const facts = input.facts?.length ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;margin:10px 0 28px;border-top:1px solid #ecdde2;">${input.facts.map(fact => `<tr><td style="padding:20px 0;border-bottom:1px solid #ecdde2;"><p style="margin:0 0 8px;font-size:11px;line-height:1.5;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:#a12742;">${escapeHtml(fact.label)}</p><p style="margin:0;font-size:18px;line-height:1.6;font-weight:500;color:#261014;overflow-wrap:anywhere;word-break:break-word;">${lines(fact.value)}</p></td></tr>`).join("")}</table>` : "";
  const action = primary ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr><td align="center" bgcolor="#d91335" style="background-color:#d91335;mso-padding-alt:17px 24px;"><a href="${escapeHtml(primary.url)}" style="display:block;padding:17px 24px;color:#ffffff;font-size:16px;line-height:1.5;font-weight:700;text-align:center;text-decoration:none;mso-padding-alt:0;">${escapeHtml(primary.label)}</a></td></tr></table><p style="margin:16px 0 0;color:#795d67;font-size:12px;line-height:1.7;">If the button doesn’t open, use this link:<br /><a href="${escapeHtml(primary.url)}" style="color:#a12742;text-decoration:underline;overflow-wrap:anywhere;word-break:break-all;">${escapeHtml(primary.fallbackLabel ?? primary.url)}</a></p>` : "";
  const secondaryAction = secondary ? `<p style="margin:24px 0 0;font-size:15px;line-height:1.7;"><a href="${escapeHtml(secondary.url)}" style="color:#a12742;font-weight:600;text-decoration:underline;text-underline-offset:3px;">${escapeHtml(secondary.label)}</a></p>` : "";
  const note = input.note ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;margin-top:28px;"><tr><td bgcolor="#fff5f7" style="padding:18px 20px;border-left:2px solid #e9a7b5;background-color:#fff5f7;font-size:13px;line-height:1.8;color:#795d67;">${lines(input.note)}</td></tr></table>` : "";
  const html = `<!doctype html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="x-apple-disable-message-reformatting" /><meta name="color-scheme" content="light" /><meta name="supported-color-schemes" content="light" /><title>${escapeHtml(input.title)} | ${siteName}</title><!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]--></head>
<body lang="en" dir="ltr" style="margin:0;padding:0;width:100%;background-color:#fff8fa;color:#261014;font-family:'DM Sans',Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div lang="en" dir="ltr" style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(input.preheader)}</div>
<table lang="en" dir="ltr" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#fff8fa" style="width:100%;background-color:#fff8fa;"><tr><td align="center" style="padding:24px 12px 40px;">
<!--[if mso]><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600"><tr><td><![endif]-->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#ffffff" style="width:100%;max-width:600px;table-layout:fixed;margin:0 auto;border:1px solid #ecdde2;background-color:#ffffff;">
<tr><td style="padding:30px 28px 26px;"><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td><a href="${siteOrigin}/" aria-label="${siteName} home" style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:40px;line-height:1;font-weight:800;letter-spacing:-3px;color:#261014;text-decoration:none;">adal<span style="color:#d91335;">.</span></a></td><td align="right" style="padding-left:16px;font-size:11px;line-height:1.5;color:#795d67;">${siteName}</td></tr></table></td></tr>
<tr><td bgcolor="#d91335" style="padding:38px 28px 36px;background-color:#d91335;">${input.eyebrow ? `<p style="margin:0 0 20px;color:#ffffff;font-size:10px;line-height:1.6;letter-spacing:1.6px;text-transform:uppercase;font-weight:600;">${escapeHtml(input.eyebrow)}</p>` : ""}<h1 style="margin:0;color:#ffffff;font-size:42px;line-height:1.12;letter-spacing:-1.5px;font-weight:500;overflow-wrap:anywhere;">${lines(input.title)}</h1><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="64" style="width:64px;margin-top:28px;"><tr><td height="2" bgcolor="#ffb8c6" style="height:2px;line-height:2px;font-size:1px;background-color:#ffb8c6;">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:30px 28px 32px;">${paragraphs}${facts}${action}${secondaryAction}${note}</td></tr>
<tr><td style="padding:23px 28px 26px;border-top:1px solid #ecdde2;"><p style="margin:0 0 8px;color:#261014;font-size:13px;line-height:1.7;font-weight:600;">${siteName}</p><p style="margin:0;color:#795d67;font-size:12px;line-height:1.8;">Here to help: ${supportEmail}</p><p style="margin:14px 0 0;font-size:12px;line-height:1.8;"><a href="${siteOrigin}/about" style="color:#795d67;text-decoration:underline;">About us</a>&nbsp;&nbsp;&nbsp; <a href="${siteOrigin}/privacy" style="color:#795d67;text-decoration:underline;">Privacy</a>&nbsp;&nbsp;&nbsp; <a href="${siteOrigin}/terms" style="color:#795d67;text-decoration:underline;">Terms</a></p></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  const text = [
    siteName,
    input.eyebrow,
    input.title,
    ...(input.paragraphs ?? []),
    ...(input.facts ?? []).map(fact => `${fact.label}\n${fact.value}`),
    ...(primary ? [`${primary.label}\n${primary.url}`] : []),
    ...(secondary ? [`${secondary.label}\n${secondary.url}`] : []),
    input.note,
    `${siteName}\n${supportEmail}`,
    `About us: ${siteOrigin}/about\nPrivacy: ${siteOrigin}/privacy\nTerms: ${siteOrigin}/terms`,
  ].filter((value): value is string => value !== undefined && value !== "").join("\n\n");
  return { html, text };
}
