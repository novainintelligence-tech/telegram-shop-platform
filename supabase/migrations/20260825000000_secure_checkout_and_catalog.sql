-- Atomic checkout, inventory synchronization, and a lawful demo catalog.

create or replace function public.checkout_cart(p_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric(14,2);
  v_total numeric(14,2);
  v_order_id bigint;
  v_item record;
  v_keys text[];
  v_delivery jsonb := '[]'::jsonb;
begin
  select wallet_balance into v_balance
  from public.bot_users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Customer not found';
  end if;

  select coalesce(sum(p.price * c.quantity), 0)
  into v_total
  from public.cart_items c
  join public.products p on p.id = c.product_id
  where c.user_id = p_user_id
    and p.is_active = true;

  if v_total <= 0 then raise exception 'Your cart is empty.'; end if;
  if v_balance < v_total then
    raise exception 'Insufficient balance. Order total is $% and your balance is $%.', v_total, v_balance;
  end if;

  insert into public.orders (user_id, total_amount, status)
  values (p_user_id, v_total, 'processing')
  returning id into v_order_id;

  for v_item in
    select p.id, p.name, p.price, p.product_type, p.download_link, c.quantity
    from public.cart_items c
    join public.products p on p.id = c.product_id
    where c.user_id = p_user_id
    order by c.id
  loop
    if v_item.quantity < 1 then raise exception 'Invalid cart quantity'; end if;

    if v_item.product_type = 'key' then
      select array_agg(key_value order by id) into v_keys
      from (
        select id, key_value
        from public.product_keys
        where product_id = v_item.id and is_sold = false
        order by id
        for update skip locked
        limit v_item.quantity
      ) available;

      if coalesce(array_length(v_keys, 1), 0) < v_item.quantity then
        raise exception 'Sorry, "%" does not have enough stock.', v_item.name;
      end if;

      update public.product_keys
      set is_sold = true, order_id = v_order_id, sold_at = now()
      where product_id = v_item.id and key_value = any(v_keys) and is_sold = false;

      insert into public.order_items (order_id, product_id, product_name, quantity, price, delivered_asset)
      values (v_order_id, v_item.id, v_item.name, v_item.quantity, v_item.price, array_to_string(v_keys, E'\n'));
    else
      insert into public.order_items (order_id, product_id, product_name, quantity, price, delivered_asset)
      values (v_order_id, v_item.id, v_item.name, v_item.quantity, v_item.price,
        coalesce(v_item.download_link, 'Download link will be sent by support.'));
    end if;

    v_delivery := v_delivery || jsonb_build_array(jsonb_build_object(
      'name', v_item.name,
      'asset', case when v_item.product_type = 'key' then array_to_string(v_keys, E'\n')
                    else coalesce(v_item.download_link, 'Download link will be sent by support.') end
    ));
  end loop;

  update public.bot_users set wallet_balance = wallet_balance - v_total where id = p_user_id
  returning wallet_balance into v_balance;

  insert into public.wallet_ledger (user_id, amount, balance_after, reason, order_id)
  values (p_user_id, -v_total, v_balance, 'Order #' || v_order_id, v_order_id);

  update public.orders set status = 'completed', completed_at = now() where id = v_order_id;
  delete from public.cart_items where user_id = p_user_id;

  update public.products p
  set stock_count = (select count(*) from public.product_keys k where k.product_id = p.id and k.is_sold = false)
  where p.product_type = 'key';

  return jsonb_build_object('orderId', v_order_id, 'total', v_total, 'balance', v_balance, 'delivery', v_delivery);
end;
$$;

revoke all on function public.checkout_cart(bigint) from public, anon, authenticated;
grant execute on function public.checkout_cart(bigint) to service_role;

create or replace function public.sync_product_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products
  set stock_count = (select count(*) from public.product_keys where product_id = coalesce(new.product_id, old.product_id) and is_sold = false)
  where id = coalesce(new.product_id, old.product_id);
  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_product_stock() from public, anon, authenticated;
drop trigger if exists trg_sync_product_stock on public.product_keys;
create trigger trg_sync_product_stock
after insert or update or delete on public.product_keys
for each row execute function public.sync_product_stock();

-- Neutral, lawful examples. Dollar quoting avoids punctuation/shell quoting issues.
insert into public.categories (name, description, sort_order)
select v.name, v.description, v.sort_order
from (values
  ($txt$Digital Guides$txt$, $txt$Practical reference material for online work.$txt$, 10),
  ($txt$Creative Assets$txt$, $txt$Reusable templates and design resources.$txt$, 20),
  ($txt$Productivity$txt$, $txt$Tools and checklists for focused work.$txt$, 30)
) as v(name, description, sort_order)
where not exists (select 1 from public.categories c where lower(c.name) = lower(v.name));

insert into public.products (name, description, price, product_type, category_id, download_link, is_active)
select v.name, v.description, v.price, 'file'::public.product_type, c.id, v.download_link, true
from (values
  ($txt$Freelancer Invoice Template$txt$, $txt$Editable invoice and payment-tracking template.$txt$, 12.00, $txt$https://example.com/downloads/invoice-template$txt$, $txt$Creative Assets$txt$),
  ($txt$Client Onboarding Checklist$txt$, $txt$A step-by-step client intake workflow.$txt$, 9.00, $txt$https://example.com/downloads/onboarding-checklist$txt$, $txt$Productivity$txt$),
  ($txt$Remote Work Security Guide$txt$, $txt$A practical guide to safer everyday remote work.$txt$, 18.00, $txt$https://example.com/downloads/security-guide$txt$, $txt$Digital Guides$txt$),
  ($txt$Content Calendar Pack$txt$, $txt$Monthly planning templates for creators and small teams.$txt$, 15.00, $txt$https://example.com/downloads/content-calendar$txt$, $txt$Creative Assets$txt$),
  ($txt$Focus Sprint Workbook$txt$, $txt$Printable planning pages for structured focus sessions.$txt$, 7.00, $txt$https://example.com/downloads/focus-workbook$txt$, $txt$Productivity$txt$)
) as v(name, description, price, download_link, category_name)
join public.categories c on c.name = v.category_name
where not exists (select 1 from public.products p where lower(p.name) = lower(v.name));
