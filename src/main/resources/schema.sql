create table tasks (
  id uuid primary key, advisor text not null, request_key uuid not null,
  case_ref text not null, kind text not null, due_date date not null,
  done boolean not null default false, unique(advisor,request_key)
);
create index tasks_by_advisor_due on tasks(advisor,done,due_date);
create table outbox (
  id uuid primary key references tasks(id), owner text, fence bigint not null default 0,
  available_at timestamptz not null default now(), sent boolean not null default false
);
create index outbox_pending on outbox(available_at,id) where not sent;
create table inbox (id uuid primary key references tasks(id), received_at timestamptz not null default now());
create table switches (advisor text primary key, paused boolean not null default false);
create table events (seq bigserial primary key, task_id uuid not null references tasks(id),
  actor text not null, action text not null, at timestamptz not null default now());
create index events_task on events(task_id,seq);
