-- Gatherly relational model for Postgres / Supabase.
-- The prototype runs this shape in the browser. Realtime belongs on
-- conversations, messages, polls, and pulses.

create table users (
  id text primary key,
  name text not null,
  email text not null unique,
  phone text,
  city text not null,
  neighborhood text not null,
  lat double precision not null,
  lng double precision not null,
  headline text not null,
  avatar_hue integer not null,
  portrait integer not null,
  languages text[] not null default '{}',
  interests text[] not null default '{}',
  email_verified boolean not null default false,
  phone_verified boolean not null default false,
  identity_status text not null default 'unverified' check (identity_status in ('unverified', 'pending', 'verified')),
  include_women_only boolean not null default false,
  member_since timestamptz not null,
  trusted_contact_name text,
  trusted_contact_phone text
);

create table user_preferences (
  user_id text primary key references users(id),
  group_min integer not null,
  group_max integer not null,
  energy text[] not null,
  languages text[] not null,
  accessibility_needs text[] not null default '{}',
  prefers_free boolean not null default false,
  max_price integer,
  guidelines_accepted_at timestamptz,
  reminder_hours integer
);

create table verifications (
  id text primary key,
  user_id text not null references users(id),
  kind text not null check (kind in ('email', 'phone', 'identity')),
  status text not null check (status in ('unverified', 'pending', 'verified')),
  updated_at timestamptz not null
);

create table venues (
  id text primary key,
  name text not null,
  neighborhood text not null,
  city text not null,
  area_lat double precision not null,
  area_lng double precision not null,
  exact_lat double precision not null,
  exact_lng double precision not null,
  exact_address text not null,
  meeting_note text not null
);

create table communities (
  id text primary key,
  name text not null,
  summary text not null,
  cover text not null,
  neighborhood text not null,
  organizer_id text not null references users(id),
  join_note text not null,
  schedule text not null
);

create table activities (
  id text primary key,
  community_id text references communities(id),
  host_id text not null references users(id),
  venue_id text not null references venues(id),
  title text not null,
  description text not null,
  type text not null,
  cover text not null,
  starts_at timestamptz not null,
  duration_min integer not null,
  capacity integer not null check (capacity between 2 and 16),
  price integer not null default 0,
  currency text not null default 'AED',
  energy text not null check (energy in ('Relaxed', 'Lively', 'Focused')),
  languages text[] not null,
  accessibility text[] not null,
  experience text not null,
  audience text not null check (audience in ('public', 'private', 'women-only', 'approval')),
  tags text[] not null,
  modules jsonb not null,
  guidelines text[] not null,
  cancellation_policy text not null,
  status text not null check (status in ('scheduled', 'cancelled'))
);

create table rsvps (
  id text primary key,
  activity_id text not null references activities(id),
  user_id text not null references users(id),
  status text not null check (status in ('invited', 'pending', 'going', 'checked-in', 'attended', 'no-show', 'cancelled')),
  en_route boolean not null default false,
  created_at timestamptz not null,
  unique (activity_id, user_id)
);

create table waitlist_entries (
  id text primary key,
  activity_id text not null references activities(id),
  user_id text not null references users(id),
  created_at timestamptz not null,
  unique (activity_id, user_id)
);

create table community_members (
  id text primary key,
  community_id text not null references communities(id),
  user_id text not null references users(id),
  role text not null check (role in ('organizer', 'member')),
  joined_at timestamptz not null,
  unique (community_id, user_id)
);

create table conversations (
  id text primary key,
  kind text not null check (kind in ('activity', 'community', 'direct')),
  activity_id text references activities(id),
  community_id text references communities(id),
  title text not null
);

create table conversation_members (
  conversation_id text not null references conversations(id),
  user_id text not null references users(id),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create table messages (
  id text primary key,
  conversation_id text not null references conversations(id),
  sender_id text references users(id),
  kind text not null check (kind in ('text', 'system', 'announcement', 'enroute')),
  body text not null,
  parent_id text references messages(id),
  created_at timestamptz not null
);

create table message_reactions (
  message_id text not null references messages(id),
  user_id text not null references users(id),
  emoji text not null,
  primary key (message_id, user_id, emoji)
);

create table polls (
  id text primary key,
  activity_id text not null references activities(id),
  author_id text not null references users(id),
  question text not null,
  live boolean not null default false,
  created_at timestamptz not null
);

create table poll_options (
  id text primary key,
  poll_id text not null references polls(id),
  label text not null
);

create table poll_votes (
  id text primary key,
  poll_id text not null references polls(id),
  option_id text not null references poll_options(id),
  user_id text not null references users(id),
  created_at timestamptz not null,
  unique (poll_id, user_id)
);

create table check_ins (
  id text primary key,
  activity_id text not null references activities(id),
  user_id text not null references users(id),
  method text not null check (method in ('self', 'code', 'host')),
  created_at timestamptz not null,
  unique (activity_id, user_id)
);

create table prompt_cards (
  id text primary key,
  activity_id text not null references activities(id),
  prompt text not null
);

create table prompt_answers (
  id text primary key,
  prompt_id text not null references prompt_cards(id),
  user_id text not null references users(id),
  body text not null,
  created_at timestamptz not null,
  unique (prompt_id, user_id)
);

create table suggestions (
  id text primary key,
  activity_id text not null references activities(id),
  user_id text not null references users(id),
  title text not null,
  created_at timestamptz not null
);

create table checklists (
  id text primary key,
  activity_id text not null references activities(id),
  user_id text not null references users(id),
  items jsonb not null,
  unique (activity_id, user_id)
);

create table connection_requests (
  id text primary key,
  activity_id text not null references activities(id),
  from_user_id text not null references users(id),
  to_user_id text not null references users(id),
  created_at timestamptz not null,
  unique (activity_id, from_user_id, to_user_id)
);

create table mutual_connections (
  id text primary key,
  user_a_id text not null references users(id),
  user_b_id text not null references users(id),
  activity_id text not null references activities(id),
  created_at timestamptz not null
);

create table event_media (
  id text primary key,
  activity_id text not null references activities(id),
  author_id text not null references users(id),
  src text not null,
  caption text not null,
  created_at timestamptz not null
);

create table reviews (
  id text primary key,
  activity_id text not null references activities(id),
  author_id text not null references users(id),
  host_id text not null references users(id),
  host_rating integer not null check (host_rating between 1 and 5),
  event_rating integer not null check (event_rating between 1 and 5),
  belonging integer not null check (belonging between 1 and 5),
  note text not null,
  safety_concern boolean not null default false,
  created_at timestamptz not null,
  unique (activity_id, author_id)
);

create table safety_reports (
  id text primary key,
  reporter_id text not null references users(id),
  target_user_id text references users(id),
  activity_id text references activities(id),
  reason text not null,
  details text not null,
  status text not null check (status in ('open', 'reviewing', 'closed')),
  created_at timestamptz not null
);

create table blocks (
  id text primary key,
  user_id text not null references users(id),
  blocked_user_id text not null references users(id),
  created_at timestamptz not null,
  unique (user_id, blocked_user_id)
);

create table notifications (
  id text primary key,
  user_id text not null references users(id),
  title text not null,
  body text not null,
  href text not null,
  kind text not null,
  created_at timestamptz not null,
  read boolean not null default false
);

create table location_shares (
  activity_id text not null references activities(id),
  user_id text not null references users(id),
  active boolean not null,
  updated_at timestamptz not null,
  primary key (activity_id, user_id)
);

create table game_marks (
  activity_id text not null references activities(id),
  user_id text not null references users(id),
  kind text not null check (kind in ('bingo', 'mission')),
  item_id text not null,
  primary key (activity_id, user_id, kind, item_id)
);

create table pulse_votes (
  activity_id text not null references activities(id),
  user_id text not null references users(id),
  value text not null check (value in ('great', 'okay', 'help')),
  updated_at timestamptz not null,
  primary key (activity_id, user_id)
);

create table saved_activities (
  user_id text not null references users(id),
  activity_id text not null references activities(id),
  primary key (user_id, activity_id)
);

create index activities_starts_at_idx on activities (starts_at);
create index rsvps_activity_idx on rsvps (activity_id, status);
create index messages_conversation_idx on messages (conversation_id, created_at);
create index notifications_user_idx on notifications (user_id, created_at desc);
