# IronHybrid Firebase V4

Atualização da V3 com duas correções principais:

- estimativas metabólicas corrigidas e com atualização ao vivo;
- dieta por dia com opção de café da manhã ou jejum, além de corrida à noite.

## Avaliação
- Básica: calcula Mifflin-St Jeor e TDEE.
- Bioimpedância/Completa: se houver BF% ou massa livre de gordura, também calcula Katch-McArdle e Cunningham.
- O app não estima Katch/Cunningham sem massa livre de gordura.
- Depois de salvar, os números aparecem imediatamente e sincronizam pelo Firestore.

## Dieta
Cada dia salva:
- com café da manhã (~09:00) ou jejum até o almoço;
- com ou sem corrida à noite.

Quando há corrida à noite:
- não há jantar às 18h;
- o lanche da tarde vira pré-treino leve;
- jantar passa para ~20:30–21:00;
- fruta entra como complemento;
- whey/leite podem completar proteína;
- granola entra opcionalmente, principalmente longe do pré-treino.

A refeição de véspera do longão continua aparecendo no dia anterior.

## Atualizar no GitHub
Substitua os arquivos da V3 pelos arquivos desta V4 e faça Commit.
O service worker foi alterado para reduzir problemas de cache.
