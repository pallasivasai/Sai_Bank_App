-- SAI Bank App: 24-hour transfer recovery, overdraft freeze, and debt repayment
-- Applied to Supabase project jgubunffqfyapurxpoih on 2026-10-23.
-- This file is retained in source control as a reference migration.
begin;
alter table public.bank_accounts drop constraint if exists bank_accounts_balance_check;
alter table public.bank_accounts add column if not exists recovery_debt numeric(14,2) not null default 0 check (recovery_debt >= 0);
create table if not exists public.bank_recovery_requests (
  recovery_id uuid primary key default gen_random_uuid(),
  original_transaction_id uuid not null unique references public.bank_transactions(transaction_id),
  requester_user_id uuid not null references auth.users(id),
  sender_account_id uuid not null references public.bank_accounts(account_id),
  recipient_account_id uuid not null references public.bank_accounts(account_id),
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'completed' check (status in ('completed','rejected')),
  reason text,
  created_at timestamptz not null default now()
);
alter table public.bank_recovery_requests enable row level security;
drop policy if exists recovery_requests_select_own on public.bank_recovery_requests;
create policy recovery_requests_select_own on public.bank_recovery_requests for select to authenticated using (requester_user_id = auth.uid());
revoke insert, update, delete on public.bank_recovery_requests from anon, authenticated;

create or replace function public.transfer_money(p_from_account uuid,p_to_account uuid,p_amount numeric,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_from public.bank_accounts%rowtype; v_to public.bank_accounts%rowtype; v_tx public.bank_transactions%rowtype;
begin
 if auth.uid() is null then raise exception 'Please sign in first'; end if;
 if p_amount is null or p_amount<=0 or p_amount>1000000 then raise exception 'Enter a valid transfer amount'; end if;
 if p_from_account=p_to_account then raise exception 'Source and destination accounts must be different'; end if;
 if p_idempotency_key is null then raise exception 'A transaction key is required'; end if;
 select * into v_tx from public.bank_transactions where idempotency_key=p_idempotency_key;
 if v_tx.transaction_id is not null then
   if not exists(select 1 from public.bank_accounts a where a.account_id=v_tx.from_account_id and a.user_id=auth.uid()) then raise exception 'Not authorized'; end if;
   return jsonb_build_object('transaction_id',v_tx.transaction_id,'status',v_tx.status,'replayed',true);
 end if;
 if p_from_account::text<p_to_account::text then
  select * into v_from from public.bank_accounts where account_id=p_from_account for update;
  select * into v_to from public.bank_accounts where account_id=p_to_account for update;
 else
  select * into v_to from public.bank_accounts where account_id=p_to_account for update;
  select * into v_from from public.bank_accounts where account_id=p_from_account for update;
 end if;
 if v_from.account_id is null or v_to.account_id is null then raise exception 'Account not found'; end if;
 if v_from.user_id<>auth.uid() then raise exception 'Not authorized for source account'; end if;
 if v_from.status<>'active' or v_to.status<>'active' then raise exception 'One or both accounts are frozen or inactive'; end if;
 if v_from.balance<p_amount then raise exception 'Insufficient funds'; end if;
 if v_from.currency<>v_to.currency then raise exception 'Currency mismatch'; end if;
 update public.bank_accounts set balance=balance-p_amount where account_id=p_from_account;
 update public.bank_accounts set balance=balance+p_amount where account_id=p_to_account;
 insert into public.bank_transactions(idempotency_key,from_account_id,to_account_id,amount,currency,transaction_type,status,reference,completed_at)
 values(p_idempotency_key,p_from_account,p_to_account,p_amount,v_from.currency,'transfer','completed','P2P transfer',now()) returning * into v_tx;
 return jsonb_build_object('success',true,'transaction_id',v_tx.transaction_id,'status','completed','amount',v_tx.amount,'currency',v_tx.currency,'created_at',v_tx.created_at,'replayed',false);
end; $function$;

create or replace function public.reverse_transaction(p_transaction_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_tx public.bank_transactions%rowtype; v_sender public.bank_accounts%rowtype; v_recipient public.bank_accounts%rowtype; v_reverse_id uuid; v_shortfall numeric(14,2);
begin
 if auth.uid() is null then raise exception 'Please sign in first'; end if;
 select t.* into v_tx from public.bank_transactions t join public.bank_accounts a on a.account_id=t.from_account_id
 where t.transaction_id=p_transaction_id and a.user_id=auth.uid() and t.transaction_type='transfer' and t.status='completed'
 and t.from_account_id is not null and t.to_account_id is not null and t.created_at>=now()-interval '24 hours' for update of t;
 if not found then raise exception 'Transaction is not eligible for recovery: only your completed transfers within 24 hours can be recovered'; end if;
 if exists(select 1 from public.bank_recovery_requests where original_transaction_id=p_transaction_id)
  or exists(select 1 from public.bank_transactions where reference='reversal:'||p_transaction_id::text) then raise exception 'This transaction has already been reversed'; end if;
 if v_tx.from_account_id::text<v_tx.to_account_id::text then
  select * into v_sender from public.bank_accounts where account_id=v_tx.from_account_id for update;
  select * into v_recipient from public.bank_accounts where account_id=v_tx.to_account_id for update;
 else
  select * into v_recipient from public.bank_accounts where account_id=v_tx.to_account_id for update;
  select * into v_sender from public.bank_accounts where account_id=v_tx.from_account_id for update;
 end if;
 v_shortfall:=greatest(0,v_tx.amount-v_recipient.balance);
 update public.bank_accounts set balance=balance-v_tx.amount,recovery_debt=recovery_debt+v_shortfall,
 status=case when (balance-v_tx.amount)<0 then 'frozen' else status end where account_id=v_recipient.account_id;
 update public.bank_accounts set balance=balance+v_tx.amount where account_id=v_sender.account_id;
 insert into public.bank_transactions(from_account_id,to_account_id,amount,currency,transaction_type,status,reference,completed_at)
 values(v_recipient.account_id,v_sender.account_id,v_tx.amount,v_tx.currency,'reversal','reversed','reversal:'||p_transaction_id::text,now()) returning transaction_id into v_reverse_id;
 insert into public.bank_recovery_requests(original_transaction_id,requester_user_id,sender_account_id,recipient_account_id,amount,status,reason)
 values(p_transaction_id,auth.uid(),v_sender.account_id,v_recipient.account_id,v_tx.amount,'completed',
 case when v_shortfall>0 then 'Recipient balance shortfall; account frozen pending repayment' else 'Recovered within 24-hour window' end);
 update public.bank_transactions set status='reversed' where transaction_id=p_transaction_id;
 return jsonb_build_object('success',true,'reversal_transaction_id',v_reverse_id,'status','reversed','amount',v_tx.amount,
 'recipient_shortfall',v_shortfall,'recipient_balance',v_recipient.balance-v_tx.amount,'recipient_account_frozen',((v_recipient.balance-v_tx.amount)<0),
 'message',case when v_shortfall>0 then 'Recovery recorded. Recipient account is frozen until future credits settle the debt.' else 'Payment recovered successfully.' end);
end; $function$;

create or replace function public.apply_account_credit(p_account_id uuid,p_amount numeric,p_reference text default null)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_account public.bank_accounts%rowtype; v_to_debt numeric(14,2); v_remainder numeric(14,2);
begin
 if auth.uid() is null then raise exception 'Please sign in first'; end if;
 if p_amount is null or p_amount<=0 or p_amount>1000000 then raise exception 'Enter a valid credit amount'; end if;
 select * into v_account from public.bank_accounts where account_id=p_account_id for update;
 if not found then raise exception 'Account not found'; end if;
 if v_account.user_id<>auth.uid() then raise exception 'Not authorized for this account'; end if;
 if v_account.status='closed' then raise exception 'Closed accounts cannot receive credits'; end if;
 v_to_debt:=least(p_amount,v_account.recovery_debt); v_remainder:=p_amount-v_to_debt;
 update public.bank_accounts set recovery_debt=recovery_debt-v_to_debt,balance=balance+v_remainder,
 status=case when recovery_debt-v_to_debt<=0 and balance+v_remainder>=0 then 'active' else 'frozen' end where account_id=p_account_id;
 return jsonb_build_object('success',true,'credited_amount',p_amount,'debt_repaid',v_to_debt,'available_balance_added',v_remainder,
 'account_status',case when v_account.recovery_debt-v_to_debt<=0 and v_account.balance+v_remainder>=0 then 'active' else 'frozen' end);
end; $function$;
revoke all on function public.transfer_money(uuid,uuid,numeric,uuid) from public,anon;
grant execute on function public.transfer_money(uuid,uuid,numeric,uuid) to authenticated;
revoke all on function public.reverse_transaction(uuid) from public,anon;
grant execute on function public.reverse_transaction(uuid) to authenticated;
revoke all on function public.apply_account_credit(uuid,numeric,text) from public,anon;
grant execute on function public.apply_account_credit(uuid,numeric,text) to authenticated;
commit;
