alter table public.supply_purchase_order_items
  alter column line_total set expression as (
    case
      when shipping_type = 'pending'::public.supply_shipping_type or shipping_amount is null then null
      else greatest(
        round(quantity * unit_price, 2)
        - discount_amount
        + shipping_amount
        + other_costs,
        0
      )
    end
  );