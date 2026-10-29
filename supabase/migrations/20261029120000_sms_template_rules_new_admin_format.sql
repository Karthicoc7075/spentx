-- Convert public.sms_template_rules from the old admin template shape
-- to the shape saved by the Add template form on admin-template-builder.
--
-- Confirmed against the form code:
--   Old form (main @ c6892f6, SmsTemplateTagger.buildTemplateFromTags)
--     extraction_map values: title, merchantName (saved as title),
--       cardNumber (saved as accountLast4), accountNumber, accountLast4
--     template tokens: {TITLE}, {MERCHANTNAME}, {ACCOUNTNUMBER}, {CARDNUMBER}
--     mode: upi | atm | card, plus seeded values (neft, salary, emi, ...)
--   New form (this branch, buildTemplateFromTags + handleFinalSave)
--     extraction_map values: merchant (title and merchantName both become
--       merchant), accountLast4 (cardLast4 and cardNumber both become
--       accountLast4). There is no accountNumber field.
--     template tokens: {MERCHANT}, {ACCOUNTLAST4}
--     mode saved: pos and online are stored as card. Every other mode
--       string is stored as chosen.
--     extraction_map.__meta is a JSON string (not an object):
--       {"smsKind","senderIds","dateFormat","titleOption","category"}
--       defaults used here:
--         smsKind    payment          (compiler default)
--         senderIds  catalog ids for bank_name, else []
--         dateFormat dd-MMM-yy        (screen default)
--         titleOption merchant        (compiler default)
--         category   Shopping         (Add template screen starts here)
--
-- Live rows (read 2026-10-29, not modified by this file) store the field
-- name as the VALUE, for example {"Payee":"title","Amount":"amount"}.
-- A few rows may instead use title / merchantName as KEYS. This script
-- rewrites both. It does not invent a merchant tag on a row that never
-- had title, merchantName, or Payee (mostly ATM templates).
--
-- Does not delete rows. Does not update any table except
-- sms_template_rules. The backup table is new, as requested.
-- An existing trigger on sms_template_rules bumps public.rules_version
-- after the update. This file does not write that table. A rollback of
-- the migration transaction rolls the version bump back too.
--
-- RUN ONCE, in this order, in the Supabase SQL editor:
--   1. Backup
--   2. Precheck (read the counts, and the type = 'transfer' list)
--   3. Migration transaction
--   4. Verify
--   5. Rollback section only if verify fails (it is commented out)
--
-- Do not run this file twice. The backup statement stops if the backup
-- table already exists, so a second run cannot replace the original copy.

-- ============================================================================
-- 1. Backup
-- ============================================================================

create table public.sms_template_rules_backup_20261029 as
select * from public.sms_template_rules;

alter table public.sms_template_rules_backup_20261029 enable row level security;
revoke all on table public.sms_template_rules_backup_20261029 from public, anon, authenticated;

comment on table public.sms_template_rules_backup_20261029 is
  'Full copy of sms_template_rules taken before the 2026-10-29 new-format conversion. Restore from the rollback section of 20261029120000_sms_template_rules_new_admin_format.sql.';

-- ============================================================================
-- 2. Precheck (read only)
-- ============================================================================

-- One row of counts. Field names on the live seed are VALUES
-- ("Payee" -> "title"), not keys. Both are counted.
select
  count(*) as row_count,
  count(*) filter (where extraction_map ? 'title') as key_title,
  count(*) filter (where extraction_map ? 'merchantName') as key_merchant_name,
  count(*) filter (where extraction_map ? 'merchant') as key_merchant,
  count(*) filter (where extraction_map ? 'cardNumber') as key_card_number,
  count(*) filter (where extraction_map ? 'accountNumber') as key_account_number,
  count(*) filter (where extraction_map ? 'accountLast4') as key_account_last4,
  count(*) filter (where extraction_map ? '__meta') as has_meta,
  count(*) filter (
    where exists (
      select 1
      from jsonb_each(coalesce(extraction_map, '{}'::jsonb)) e
      where e.key is distinct from '__meta'
        and e.value #>> '{}' = 'title'
    )
  ) as value_title,
  count(*) filter (
    where exists (
      select 1
      from jsonb_each(coalesce(extraction_map, '{}'::jsonb)) e
      where e.key is distinct from '__meta'
        and e.value #>> '{}' = 'merchantName'
    )
  ) as value_merchant_name,
  count(*) filter (
    where exists (
      select 1
      from jsonb_each(coalesce(extraction_map, '{}'::jsonb)) e
      where e.key is distinct from '__meta'
        and e.value #>> '{}' = 'merchant'
    )
  ) as value_merchant,
  count(*) filter (
    where exists (
      select 1
      from jsonb_each(coalesce(extraction_map, '{}'::jsonb)) e
      where e.key is distinct from '__meta'
        and e.value #>> '{}' = 'cardNumber'
    )
  ) as value_card_number,
  count(*) filter (
    where exists (
      select 1
      from jsonb_each(coalesce(extraction_map, '{}'::jsonb)) e
      where e.key is distinct from '__meta'
        and e.value #>> '{}' = 'accountNumber'
    )
  ) as value_account_number,
  count(*) filter (where template_pattern ~ '\{TITLE\}') as pattern_title,
  count(*) filter (where template_pattern ~ '\{MERCHANTNAME\}') as pattern_merchant_name,
  count(*) filter (where template_pattern ~ '\{MERCHANT\}') as pattern_merchant,
  count(*) filter (where template_pattern ~ '\{CARDNUMBER\}') as pattern_card_number,
  count(*) filter (where template_pattern ~ '\{ACCOUNTNUMBER\}') as pattern_account_number,
  count(*) filter (where lower(btrim(mode)) = 'pos') as mode_pos,
  count(*) filter (where lower(btrim(mode)) = 'online') as mode_online,
  count(*) filter (where type = 'transfer') as type_transfer
from public.sms_template_rules;

-- Mode values. pos and online become card. Every other value stays.
select mode, count(*) as rows
from public.sms_template_rules
group by mode
order by rows desc, mode;

-- type = 'transfer' is not modified. Check this list before continuing.
select
  id,
  bank_name,
  type,
  mode,
  left(template_pattern, 180) as template_pattern
from public.sms_template_rules
where type = 'transfer'
order by bank_name, mode, id;

-- ============================================================================
-- 3. Migration (one transaction)
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.sms_template_rules_backup_20261029') is null then
    raise exception 'Backup table is missing. Run section 1 first.';
  end if;
  if (select count(*) from public.sms_template_rules)
     is distinct from
     (select count(*) from public.sms_template_rules_backup_20261029) then
    raise exception 'Row count no longer matches the backup. Stop.';
  end if;
end $$;

create temp table sms_tpl_sender_ids (
  bank_name text primary key,
  sender_ids jsonb not null
) on commit drop;

-- Sender headers from assets/sms/bank_sms_templates_v5.json, keyed by the
-- bank_name values stored on sms_template_rules and by the catalog display
-- name. Banks with no sender id in that file are omitted and get [].
insert into sms_tpl_sender_ids (bank_name, sender_ids) values
  ('HDFC', '["HDFCBK","HDFCBN"]'::jsonb),
  ('HDFC Bank', '["HDFCBK","HDFCBN"]'::jsonb),
  ('AUSmallFinanceBank', '["AUSFBN","AUSFBK"]'::jsonb),
  ('AU Small Finance Bank', '["AUSFBN","AUSFBK"]'::jsonb),
  ('Axis', '["AXISBK","AXISBKN"]'::jsonb),
  ('Axis Bank', '["AXISBK","AXISBKN"]'::jsonb),
  ('BankOfMaharashtra', '["BOMBNK","BOMSMS"]'::jsonb),
  ('Bank of Maharashtra', '["BOMBNK","BOMSMS"]'::jsonb),
  ('CityUnionBank', '["CUBBNK","CUBSMS"]'::jsonb),
  ('City Union Bank', '["CUBBNK","CUBSMS"]'::jsonb),
  ('ICICI', '["ICICIB","ICICIBA"]'::jsonb),
  ('ICICI Bank', '["ICICIB","ICICIBA"]'::jsonb),
  ('IndianBank', '["INDBNK","INDBKS"]'::jsonb),
  ('Indian Bank', '["INDBNK","INDBKS"]'::jsonb),
  ('KarnatakaBank', '["KTKBNK","KTKSMS"]'::jsonb),
  ('Karnataka Bank', '["KTKBNK","KTKSMS"]'::jsonb),
  ('Kotak', '["KOTAKB","KOTAKBN"]'::jsonb),
  ('Kotak Mahindra Bank', '["KOTAKB","KOTAKBN"]'::jsonb),
  ('PunjabAndSindBank', '["PSBSMS","PSBBNK"]'::jsonb),
  ('Punjab & Sind Bank', '["PSBSMS","PSBBNK"]'::jsonb),
  ('SBI', '["SBIINB","SBIPSG","CBSSBI","SBIBNK","SBGMBS","SBYONO","ATMSBI","SBIUPI"]'::jsonb),
  ('State Bank of India', '["SBIINB","SBIPSG","CBSSBI","SBIBNK","SBGMBS","SBYONO","ATMSBI","SBIUPI"]'::jsonb),
  ('SouthIndianBank', '["SIBSMS","SIBBNK"]'::jsonb),
  ('South Indian Bank', '["SIBSMS","SIBBNK"]'::jsonb),
  ('TamilnadMercantileBank', '["TMBBNK","TMBSMS"]'::jsonb),
  ('Tamilnad Mercantile Bank', '["TMBBNK","TMBSMS"]'::jsonb),
  ('UCOBank', '["UCOBSM","UCOBNK"]'::jsonb),
  ('UCO Bank', '["UCOBSM","UCOBNK"]'::jsonb),
  ('Canara', '["CANBNK","CANABN","CNRBNK"]'::jsonb),
  ('Canara Bank', '["CANBNK","CANABN","CNRBNK"]'::jsonb),
  ('JammuKashmirBank', '["JKBBNK","JKBSMS"]'::jsonb),
  ('Jammu & Kashmir Bank', '["JKBBNK","JKBSMS"]'::jsonb),
  ('PNB', '["PNBSMS","PNBINB"]'::jsonb),
  ('Punjab National Bank', '["PNBSMS","PNBINB"]'::jsonb),
  ('BOB', '["BOBTXN","BOBSMS"]'::jsonb),
  ('Bank of Baroda', '["BOBTXN","BOBSMS"]'::jsonb),
  ('CSBBank', '["CSBBKS","CSBBNK"]'::jsonb),
  ('CSB Bank', '["CSBBKS","CSBBNK"]'::jsonb),
  ('DBS', '["DBSBNK","DBSIND"]'::jsonb),
  ('DBS Bank', '["DBSBNK","DBSIND"]'::jsonb),
  ('DCBBank', '["DCBBNK","DCBSMS"]'::jsonb),
  ('DCB Bank', '["DCBBNK","DCBSMS"]'::jsonb),
  ('EquitasSmallFinanceBank', '["EQSFBN","EQTBNK"]'::jsonb),
  ('Equitas Small Finance Bank', '["EQSFBN","EQTBNK"]'::jsonb),
  ('FederalBank', '["FEDBKN","FEDBNK"]'::jsonb),
  ('Federal Bank', '["FEDBKN","FEDBNK"]'::jsonb),
  ('IDBI', '["IDBIBN","IDBIBK"]'::jsonb),
  ('IDBI Bank', '["IDBIBN","IDBIBK"]'::jsonb),
  ('IDFC', '["IDFCBK","IDFCSM"]'::jsonb),
  ('IDFC FIRST Bank', '["IDFCBK","IDFCSM"]'::jsonb),
  ('IndusInd', '["INDBNK","INDUSB"]'::jsonb),
  ('IndusInd Bank', '["INDBNK","INDUSB"]'::jsonb),
  ('KarurVysyaBank', '["KVBBNK","KVBSMS"]'::jsonb),
  ('Karur Vysya Bank', '["KVBBNK","KVBSMS"]'::jsonb),
  ('UjjivanSmallFinanceBank', '["UJVBNK","UJVSMS"]'::jsonb),
  ('Ujjivan Small Finance Bank', '["UJVBNK","UJVSMS"]'::jsonb),
  ('UnionBank', '["UBISMS","UNIONB"]'::jsonb),
  ('Union Bank of India', '["UBISMS","UNIONB"]'::jsonb),
  ('YES', '["YESBNK","YESBKA"]'::jsonb),
  ('YES Bank', '["YESBNK","YESBKA"]'::jsonb),
  ('DhanlaxmiBank', '["DLBBNK","DLBSMS"]'::jsonb),
  ('Dhanlaxmi Bank', '["DLBBNK","DLBSMS"]'::jsonb),
  ('ESAFSmallFinanceBank', '["ESAFBK","ESAFSM"]'::jsonb),
  ('ESAF Small Finance Bank', '["ESAFBK","ESAFSM"]'::jsonb),
  ('JanaSmallFinanceBank', '["JANABN","JANASF"]'::jsonb),
  ('Jana Small Finance Bank', '["JANABN","JANASF"]'::jsonb),
  ('NainitalBank', '["NBLBNK","NBLSMS"]'::jsonb),
  ('Nainital Bank', '["NBLBNK","NBLSMS"]'::jsonb),
  ('SuryodaySmallFinanceBank', '["SRYDAY","SRYSMS"]'::jsonb),
  ('Suryoday Small Finance Bank', '["SRYDAY","SRYSMS"]'::jsonb),
  ('AirtelPaymentsBank', '["AIRBNK","APBSMS"]'::jsonb),
  ('Airtel Payments Bank', '["AIRBNK","APBSMS"]'::jsonb),
  ('BankOfIndia', '["BOISBN","BOISMS"]'::jsonb),
  ('Bank of India', '["BOISBN","BOISMS"]'::jsonb),
  ('FinoPaymentsBank', '["FINOSM","FINOBK"]'::jsonb),
  ('Fino Payments Bank', '["FINOSM","FINOBK"]'::jsonb),
  ('IOB', '["IOBSMS","IOBBKS"]'::jsonb),
  ('Indian Overseas Bank', '["IOBSMS","IOBBKS"]'::jsonb),
  ('IndiaPostPaymentsBank', '["IPPBSM","IPPBNK"]'::jsonb),
  ('India Post Payments Bank', '["IPPBSM","IPPBNK"]'::jsonb),
  ('JioPaymentsBank', '["JIOPBK","JIOSMS"]'::jsonb),
  ('Jio Payments Bank', '["JIOPBK","JIOSMS"]'::jsonb),
  ('RBL', '["RBLBNK","RBLSMS"]'::jsonb),
  ('RBL Bank', '["RBLBNK","RBLSMS"]'::jsonb),
  ('CentralBank', '["CBISMS","CENTBK"]'::jsonb),
  ('Central Bank of India', '["CBISMS","CENTBK"]'::jsonb);

create function pg_temp.convert_extraction_map(src jsonb, bank text)
returns jsonb
language plpgsql
as $fn$
declare
  m jsonb := coalesce(src, '{}'::jsonb);
  rebuilt jsonb := '{}'::jsonb;
  k text;
  v jsonb;
  senders jsonb;
begin
  if jsonb_typeof(m) is distinct from 'object' then
    m := '{}'::jsonb;
  end if;

  for k, v in
    select e.key, e.value
    from jsonb_each(m) as e
  loop
    if k is distinct from '__meta' and jsonb_typeof(v) = 'string' then
      if v #>> '{}' in ('title', 'merchantName') then
        v := to_jsonb('merchant'::text);
      elsif v #>> '{}' in ('cardNumber', 'accountNumber') then
        v := to_jsonb('accountLast4'::text);
      end if;
    end if;

    -- Old field-name keys are renamed below. Drop them here so a later
    -- merchant / accountLast4 key is not overwritten.
    if k in ('title', 'merchantName', 'cardNumber', 'accountNumber') then
      continue;
    end if;

    rebuilt := rebuilt || jsonb_build_object(k, v);
  end loop;

  -- Rename keys title / merchantName -> merchant. Prefer an existing
  -- merchant key. If both old keys exist, keep title.
  if not (rebuilt ? 'merchant') then
    if m ? 'title' then
      rebuilt := rebuilt || jsonb_build_object(
        'merchant',
        case
          when jsonb_typeof(m -> 'title') = 'string'
               and (m -> 'title') #>> '{}' in ('title', 'merchantName')
            then to_jsonb('merchant'::text)
          else m -> 'title'
        end
      );
    elsif m ? 'merchantName' then
      rebuilt := rebuilt || jsonb_build_object(
        'merchant',
        case
          when jsonb_typeof(m -> 'merchantName') = 'string'
               and (m -> 'merchantName') #>> '{}' in ('title', 'merchantName')
            then to_jsonb('merchant'::text)
          else m -> 'merchantName'
        end
      );
    end if;
  end if;

  -- Old cardNumber / accountNumber keys become accountLast4, which is the
  -- key the new form writes. Do not overwrite an accountLast4 key.
  -- Catalog tag keys such as "CardLast4" / "AccountLast4" are left as they
  -- are; their values are already accountLast4.
  if not (rebuilt ? 'accountLast4') then
    if m ? 'accountNumber' then
      rebuilt := rebuilt || jsonb_build_object(
        'accountLast4',
        case
          when jsonb_typeof(m -> 'accountNumber') = 'string'
               and (m -> 'accountNumber') #>> '{}' in ('cardNumber', 'accountNumber')
            then to_jsonb('accountLast4'::text)
          else m -> 'accountNumber'
        end
      );
    elsif m ? 'cardNumber' then
      rebuilt := rebuilt || jsonb_build_object(
        'accountLast4',
        case
          when jsonb_typeof(m -> 'cardNumber') = 'string'
               and (m -> 'cardNumber') #>> '{}' in ('cardNumber', 'accountNumber')
            then to_jsonb('accountLast4'::text)
          else m -> 'cardNumber'
        end
      );
    end if;
  end if;

  if not (rebuilt ? '__meta') then
    select s.sender_ids into senders
    from sms_tpl_sender_ids s
    where s.bank_name = bank
    limit 1;

    rebuilt := rebuilt || jsonb_build_object(
      '__meta',
      to_jsonb(
        jsonb_build_object(
          'smsKind', 'payment',
          'senderIds', coalesce(senders, '[]'::jsonb),
          'dateFormat', 'dd-MMM-yy',
          'titleOption', 'merchant',
          'category', 'Shopping'
        )::text
      )
    );
  end if;

  return rebuilt;
end;
$fn$;

-- type is intentionally not in the SET. transfer rows stay transfer.
update public.sms_template_rules as r
set
  extraction_map = pg_temp.convert_extraction_map(r.extraction_map, r.bank_name),
  template_pattern = replace(
    replace(
      replace(
        replace(
          replace(r.template_pattern, '{MERCHANTNAME}', '{MERCHANT}'),
          '{TITLE}', '{MERCHANT}'
        ),
        '{CARDNUMBER}', '{ACCOUNTLAST4}'
      ),
      '{ACCOUNTNUMBER}', '{ACCOUNTLAST4}'
    ),
    '{CARDLAST4}', '{ACCOUNTLAST4}'
  ),
  mode = case
    when lower(btrim(r.mode)) in ('pos', 'online') then 'card'
    else r.mode
  end,
  updated_at = now();

commit;

-- ============================================================================
-- 4. Verify (read only)
-- ============================================================================

-- Expect:
--   row_count = backup_count
--   old title / merchantName keys and values = 0
--   old cardNumber / accountNumber keys and values = 0
--   pattern_title = 0, pattern_merchant_name = 0
--   pattern_card_number = 0, pattern_account_number = 0
--   mode_pos = 0, mode_online = 0
--   missing_meta = 0, meta_not_string = 0
--   rows_without_merchant > 0 is expected: those templates never had a
--   title / merchantName / Payee field (ATM and similar). They are listed
--   by the next query. They do have __meta.
select
  (select count(*) from public.sms_template_rules) as row_count,
  (select count(*) from public.sms_template_rules_backup_20261029) as backup_count,
  count(*) filter (where extraction_map ? 'title') as key_title,
  count(*) filter (where extraction_map ? 'merchantName') as key_merchant_name,
  count(*) filter (where extraction_map ? 'cardNumber') as key_card_number,
  count(*) filter (where extraction_map ? 'accountNumber') as key_account_number,
  count(*) filter (
    where exists (
      select 1
      from jsonb_each(coalesce(extraction_map, '{}'::jsonb)) e
      where e.key is distinct from '__meta'
        and e.value #>> '{}' in ('title', 'merchantName')
    )
  ) as value_title_or_merchant_name,
  count(*) filter (
    where exists (
      select 1
      from jsonb_each(coalesce(extraction_map, '{}'::jsonb)) e
      where e.key is distinct from '__meta'
        and e.value #>> '{}' in ('cardNumber', 'accountNumber')
    )
  ) as value_card_or_account_number,
  count(*) filter (where template_pattern ~ '\{TITLE\}') as pattern_title,
  count(*) filter (where template_pattern ~ '\{MERCHANTNAME\}') as pattern_merchant_name,
  count(*) filter (where template_pattern ~ '\{CARDNUMBER\}') as pattern_card_number,
  count(*) filter (where template_pattern ~ '\{ACCOUNTNUMBER\}') as pattern_account_number,
  count(*) filter (where lower(btrim(mode)) in ('pos', 'online')) as mode_pos_or_online,
  count(*) filter (where not (extraction_map ? '__meta')) as missing_meta,
  count(*) filter (
    where jsonb_typeof(extraction_map -> '__meta') is distinct from 'string'
  ) as meta_not_string,
  count(*) filter (
    where extraction_map ? 'merchant'
      or exists (
        select 1
        from jsonb_each(coalesce(extraction_map, '{}'::jsonb)) e
        where e.key is distinct from '__meta'
          and e.value #>> '{}' = 'merchant'
      )
  ) as rows_with_merchant,
  count(*) filter (
    where not (
      extraction_map ? 'merchant'
      or exists (
        select 1
        from jsonb_each(coalesce(extraction_map, '{}'::jsonb)) e
        where e.key is distinct from '__meta'
          and e.value #>> '{}' = 'merchant'
      )
    )
  ) as rows_without_merchant,
  count(*) filter (where type = 'transfer') as type_transfer
from public.sms_template_rules;

-- Templates that never had a payee field. Confirm these are the ones you
-- expect (ATM cash, charges, and similar), not rows that lost a title.
select
  id,
  bank_name,
  type,
  mode,
  left(template_pattern, 180) as template_pattern
from public.sms_template_rules
where not (
  extraction_map ? 'merchant'
  or exists (
    select 1
    from jsonb_each(coalesce(extraction_map, '{}'::jsonb)) e
    where e.key is distinct from '__meta'
      and e.value #>> '{}' = 'merchant'
  )
)
order by bank_name, mode, id;

-- ============================================================================
-- 5. Rollback
-- ============================================================================
-- Uncomment and run this section only if section 4 does not match.
-- It writes the backup values back onto the same ids. It does not delete
-- rows, and it does not drop the backup table.
--
-- begin;
--
-- update public.sms_template_rules as live
-- set
--   bank_name = b.bank_name,
--   type = b.type,
--   mode = b.mode,
--   template_pattern = b.template_pattern,
--   extraction_map = b.extraction_map,
--   keywords = b.keywords,
--   is_active = b.is_active,
--   created_by = b.created_by,
--   created_at = b.created_at,
--   updated_at = b.updated_at,
--   sample_message = b.sample_message,
--   similarity_threshold = b.similarity_threshold
-- from public.sms_template_rules_backup_20261029 as b
-- where live.id = b.id;
--
-- commit;
--
-- After that, re-run the section 4 count query. row_count must still equal
-- backup_count, and value_title must be back to the precheck number.
-- Drop the backup yourself only after you are sure you do not need it:
--   drop table public.sms_template_rules_backup_20261029;
