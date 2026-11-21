export async function loadKnownAddresses() {
  const r = await fetch('./public/izakaya-addresses.json', { cache: 'no-store', referrerPolicy:'no-referrer' });
  if (!r.ok) throw new Error('Known-address database could not be loaded.');
  const text = await r.text();
  const profile = JSON.parse(text);
  return { profile, text, addresses: profile.addresses || [] };
}
function norm(chain, address) { return chain === 'evm' ? address.toLowerCase() : address; }
export function matchTransfers(records, known) {
  return records.flatMap((r) => {
    const hit = known.find(k => (k.chain === r.chain || (k.chain === 'evm' && r.chain === 'evm')) && norm(k.chain,k.address) === norm(k.chain,r.to));
    if (!hit) return [];
    return [{...r,matchedAddressId:hit.id,matchedLabel:hit.label,classification:hit.classification,evidenceLevel:hit.evidenceLevel,evidenceRefs:hit.evidenceRefs}];
  });
}
