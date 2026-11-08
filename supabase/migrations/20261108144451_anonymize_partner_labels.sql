-- Replace demo-facing labels with generic partner identifiers.
-- Stable UUIDs are preserved so product and discount ownership is unchanged.
update public.partners as partner
set
  slug = labels.slug,
  name = labels.name,
  initials = labels.initials
from (
  values
    ('596c4367-1491-481f-b0f2-1825c2540ebd'::uuid, 'partner-a', 'Partner A', 'PA'),
    ('2a304931-2230-4960-9e44-b19ed5e0178b'::uuid, 'partner-b', 'Partner B', 'PB'),
    ('652f4263-d4e3-4bf6-a5c4-778e8a08c710'::uuid, 'partner-c', 'Partner C', 'PC')
) as labels(id, slug, name, initials)
where partner.id = labels.id;
