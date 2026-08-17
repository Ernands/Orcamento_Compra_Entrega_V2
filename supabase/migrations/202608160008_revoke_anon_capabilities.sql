-- get_my_capabilities is intentionally callable by authenticated users,
-- but anonymous callers must not execute this SECURITY DEFINER RPC.
revoke execute on function public.get_my_capabilities() from anon;
