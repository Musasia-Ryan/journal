-- create trades table.

create table trades (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  pair text not null,
  direction text not null,
  entry text,
  stop text,
  target text,
  risk numeric,
  outcome text default 'open',
  checklist text,
  notes text
);

-- allow (RLS) Row Level Security
alter table trades enable row level security;

-- users with the anon key to read and write.
create policy "Allow all access for now"
on trades
for all
using (true)
with check (true);