-- Amostra do spike 24.11 (somente leitura, via scripts/db-ro.sh).
-- Leads com e-mail do Apollo, empresa no Brasil e cargo de segurança/infra/TI; uma por empresa.
-- Ordem pseudoaleatória estável (md5 do id) para a amostra ser reproduzível.
copy (
  select * from (
    select distinct on (company_name)
      id, first_name, last_name, email, company_name, title, linkedin_url,
      (phone is not null and phone <> '') as has_phone, phone,
      industry, company_size, location
    from leads
    where email is not null and email <> ''
      and (location ilike '%brazil%' or location ilike '%brasil%')
      and (title ilike '%ciso%' or title ilike '%seguran%' or title ilike '%security%'
           or title ilike '%infra%' or title ilike '%cto%' or title ilike '%tecnologia%')
    order by company_name, (email ilike '%.com.br') desc, created_at
  ) t
  order by md5(id::text)
  limit 40
) to stdout with csv header;
