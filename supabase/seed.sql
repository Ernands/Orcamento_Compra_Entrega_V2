-- Synthetic local-only stores. No real CPF, password, token, or production data belongs here.
insert into public.lojas (
  codigo_negocio,
  nome,
  cidade,
  uf,
  status,
  data_inauguracao_planejada
) values
  ('LOJ-901', 'Loja Local Aurora', 'Campinas', 'SP', 'planning', '2027-02-15'),
  ('LOJ-902', 'Loja Local Horizonte', 'Niteroi', 'RJ', 'active', '2026-11-10')
on conflict (codigo_negocio) do nothing;
