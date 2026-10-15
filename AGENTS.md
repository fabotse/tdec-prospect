# TDec Prospect — instruções do projeto

## Regra nº 1: o cliente não pode sentir o desenvolvimento

O `.env.local` aponta para o **banco de produção do cliente** (projeto Supabase `kdgogyqyaxncqoyklyxx`). Não existe banco de teste (a story 23.0 foi adiada em 2026-10-15). Tudo que roda localmente fala com os dados reais e com as contas reais do Instantly e do Apollo.

Isto precisa continuar funcionando **sempre**, sem nenhuma restrição nova:

1. **As campanhas que já estão rodando** continuam enviando no Instantly. Nada é pausado ou removido, e o recebimento de respostas e aberturas (webhook + `reply-sweep`) segue funcionando.
2. **A busca de novos leads** (Apollo e demais fontes) funciona como antes.
3. **A criação de campanhas e o envio para o Instantly** (export e ativação) funcionam como antes. Por enquanto, não colocar nenhuma trava, filtro ou bloqueio novo no caminho até o Instantly.

### Ao terminar cada etapa (story, fix ou deploy)

Antes de dar a etapa por concluída, verificar e registrar nas Completion Notes da story:

- O que a mudança pode ter alterado para o cliente: arquivos, rotas, prompts, tabelas, jobs e integrações tocados.
- Os 3 pontos acima: confirmar que continuam funcionando. Por smoke real quando a mudança toca esses caminhos; por análise do diff quando não toca. Dizer qual dos dois foi feito.
- Se algum dos 3 pontos puder ser afetado, **parar e avisar o Fabossi antes** de seguir.

### Enquanto o `.env.local` apontar para produção

- Migrations: só **aditivas** (tabela, coluna nullable, índice). Nada de `DROP`, `ALTER` destrutivo, `UPDATE`/`DELETE` em dados existentes. Aplicar só com o OK do Fabossi.
- Não criar, alterar nem reagendar jobs `pg_cron`, não publicar Edge Functions e não mudar secrets/variáveis sem pedido explícito.
- Smokes: nunca ativar campanhas de teste no Instantly, não mexer em campanhas reais do cliente e não enviar WhatsApp para leads.
