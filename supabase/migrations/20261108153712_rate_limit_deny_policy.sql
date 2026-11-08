-- Explicitly deny direct rate-limit access to browser roles.
create policy "No direct access to API rate limits"
on public.api_rate_limits
for all
to anon, authenticated
using (false)
with check (false);
