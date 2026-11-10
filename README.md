# Omni Studio

Aplicativo de desktop para conversar com modelos locais por texto, imagem, áudio e vídeo. A edição completa para Linux x86-64 inclui o **LFM3-Omni-2B Q4_K_M** oficial da Liquid AI, o projetor multimodal correspondente e o backend integrado [llama.cpp](https://github.com/ggml-org/llama.cpp).

## Edição completa para Linux x86-64

Extraia a pasta inteira do pacote de distribuição e execute `./launch.sh`. O sistema precisa de glibc compatível com o binário, GTK 4.10 ou superior e WebKitGTK 6.0. Instale também `ffmpeg` e `ffprobe` para enviar vídeos. A edição usa CPU no primeiro perfil. Para aceleração em uma máquina com Vulkan, ajuste as camadas na GPU em **Configurações → llama.cpp → Local**.

O pacote já contém os componentes necessários para iniciar o modelo sem baixar arquivos. Um servidor externo compatível, quando disponível, tem prioridade. Quem já usa o Omni Studio pode selecionar **Usar LFM3-Omni incluído** e salvar, ou continuar usando o modelo configurado. Mantenha a pasta inteira ao mover o app.

### Montagem do pacote

Use `tools/package-linux-complete.sh DIRETORIO_DE_INSUMOS BINARIO_RELEASE SAIDA.tar.gz` no Linux x86-64. Compile `omni-app` em modo release e coloque estes insumos no diretório indicado:

- `LFM3-Omni-2B-Q4_K_M.gguf`, `mmproj-LFM3-Omni-2B-Q4_K_M.gguf` e o `LICENSE` salvo como `LICENSE-LFM` da [revisão oficial fixada da Liquid AI](https://huggingface.co/LiquidAI/LFM3-Omni-2B-GGUF/tree/d508b88f08a5b4286f2d2805a6a8d69a0ff44c72).
- `llama-b12202-bin-ubuntu-vulkan-x64.tar.gz` da [release b12202 do llama.cpp](https://github.com/ggml-org/llama.cpp/releases/tag/b12202).

O script verifica os quatro SHA-256 e o limite de tamanho do GitHub Releases. O código do Omni Studio é MIT. Os pesos da Liquid AI são distribuídos sob a [LFM Open License v1.0](https://huggingface.co/LiquidAI/LFM3-Omni-2B-GGUF/blob/d508b88f08a5b4286f2d2805a6a8d69a0ff44c72/LICENSE).

## Geração local de imagens

No aplicativo desktop, abra **Configurações → stable-diffusion.cpp**. Escolha CPU ou Vulkan, selecione um checkpoint SD 1.5 de arquivo único em formato `.safetensors`, salve e instale o backend selecionado. O checkpoint é fornecido pelo usuário. Para usar a proteção de memória e gerar PNGs com dimensões exatas, coloque os [pacotes de runtime protegidos](tools/sd-runtime/README.md) ao lado do executável. Sem esses pacotes, o instalador usa o [sd-server oficial](https://github.com/leejet/stable-diffusion.cpp/releases/tag/master-1079-a3c49b1), com a faixa anterior de 256 a 1024 pixels em múltiplos de 64.

Para modelos com pesos separados, escolha **Componentes separados** e indique a difusão, o codificador de texto e o VAE. Quando o modelo pedir uma sequência de ruído específica, informe os sigmas em **Avançado**. Em Vulkan, esse modo permite usar RAM para aliviar a VRAM.

Na aba **Imagem**, escreva o prompt, escolha a resolução e clique em **Gerar**. A primeira geração carrega o modelo local. O modelo continua carregado ao cancelar, gerar novamente ou voltar ao Chat. Use **Parar backend** para liberar a memória.

## 1. Como executar a interface web de desenvolvimento

Pré-requisitos:

1. O servidor llama.cpp com o modelo **deve estar rodando** (veja a seção 3).
2. `python3` (qualquer versão moderna).
3. Navegador moderno (Chrome, Edge, Firefox, Safari).

```bash
cd omni-studio
chmod +x run.sh
./run.sh          # abre em http://127.0.0.1:5173
# ou com outra porta:
./run.sh 7070
```

> **Nota:** a interface precisa ser servida via HTTP (não `file://`). O
> `run.sh` usa o servidor estático embutido do Python (stdlib, sem
> dependências). O microfone do navegador só funciona em contexto seguro —
> `http://127.0.0.1` (localhost) conta como seguro, mas não abra o arquivo
> `index.html` direto do disco.

---

## 2. O que a interface oferece

| Funcionalidade | Como funciona de verdade |
|---|---|
| Chat por texto com streaming | `POST /v1/chat/completions` com `stream: true` (SSE), renderizado como Markdown em tempo real. |
| Imagens (arquivo, arrastar-soltar, colar) | Blocos `image_url` (data-URI) na mesma chamada de chat. |
| Áudio (arquivo ou gravação do microfone) | Blocos `input_audio` (base64). Gravações e arquivos em formatos não suportados (webm/ogg/m4a etc.) são convertidos no navegador para WAV PCM 16-bit a 24 kHz (taxa do modelo). |
| Transcrição de áudio (ASR) | Botão "🔤 transcrever" em cada anexo de áudio: usa o prompt de sistema `Perform ASR in <language>.` documentado pela Liquid AI. |
| Vídeo (com trilha sonora) | Blocos `input_video` (base64). Quando há vídeo na mensagem, a interface injeta automaticamente a instrução oficial da Liquid AI: *"Answer questions about the video using what you see and hear."* — o modelo recebe os frames **e** a trilha sonora. |
| Perguntar sobre imagem com voz | Anexe a imagem e grave a pergunta com o microfone — os dois vão juntos na mesma mensagem. |
| Respostas faladas (TTS) | Botão "ouvir" em cada resposta (ou automático, opcional): `POST /tts` com `voice` (female/male) e `lang`. Geração **idempotente** (no máximo um áudio por resposta), chamadas **serializadas**, retry com backoff para falha de rede **e** HTTP 503 (slot ocupado do llama.cpp), e validação de WAV vazio. Falhas exibem mensagem real (rede × HTTP × timeout) com diagnóstico técnico no console. |
| Conversa por voz em tempo real | Aba **Voz**: WebSocket `/v1/realtime` (protocolo OpenAI Realtime implementado pelo llama.cpp) com **escuta contínua**: o microfone fica ativo, a detecção de fala (VAD) segmenta seus turnos automaticamente e o modelo responde com texto + fala em streaming (PCM16 24 kHz). A sessão permanece aberta até você encerrá-la; o texto aparece numa **única bolha** atualizada progressivamente. A reprodução ao vivo usa player PCM **sem nenhuma barra/player visual** abaixo da conversa. Interrupção pelo botão "Parar" (barra superior). |
| Interromper geração | Texto: aborta o `fetch` (o servidor libera o slot ao desconectar). Voz: evento `response.cancel` ou botão "Parar". |
| Verificação de conexão | `GET /health`, `GET /v1/models` (detecta `input_modalities`/`output_modalities` reais) e `GET /props` (contexto, vozes), com indicador no topo. |
| Configuração do endereço | Modal de configurações (URL do servidor, voz, idioma TTS/ASR, máx. tokens, fala automática). |

---

## 3. Servidor llama.cpp

Exemplo de comando:

```bash
llama serve \
  -m /caminho/para/modelos/LFM3-Omni-2B-Q8_0.gguf \
  -mmproj /caminho/para/modelos/mmproj-LFM3-Omni-2B-Q8_0.gguf \
  -ngl all -ctk q4_0 -ctv q4_0 -c 32768 --port 8080
```

### Recomendações (opcionais, da documentação oficial)

- **`--reasoning off`** — o LFM3-Omni-2B é um modelo *não-reasoning*; a
  documentação da Liquid AI recomenda essa flag para que os turnos abram sem
  bloco de pensamento vazio. O servidor funciona sem ela (default `auto`),
  mas é o ajuste recomendado.
- **`--temp 0`** — amostragem greedy para texto (recomendada pela Liquid AI).
  Os parâmetros de áudio (`audio_temperature=0.4`, etc.) já vêm embutidos no
  GGUF.

> Não é necessário adicionar `--cors-origins`: o llama.cpp por padrão já
> reflete a `Origin` (com credenciais), então a interface local funciona sem
> mudanças.
>
> **Vídeo:** o processamento de `input_video` exige `ffmpeg`/`ffprobe` no
> `PATH` do processo do servidor (não do navegador). Se o envio de vídeo
> falhar, verifique isso.

### Dependências do modelo (documentadas)

- **Entrada:** texto, imagens, vídeo (com ou sem trilha sonora), áudio.
- **Saída:** texto, fala (24 kHz) ou texto+fala intercalados — tudo gerado
  pelo próprio modelo (um único modelo de ponta a ponta, sem ASR/TTS
  separados).
- **Idiomas de fala:** árabe, dinamarquês, alemão, grego, inglês (EUA/UK),
  finlandês, francês, hebraico, italiano, japonês, coreano, holandês,
  polonês, português, espanhol, sueco, turco, chinês (vozes feminina e
  masculina).
- **Formato de áudio do servidor:** PCM16 mono a 24 kHz (WebSocket de voz) e
  wav/mp3/flac (arquivos de entrada; outros formatos são convertidos no
  navegador).

---

## 4. Estrutura do projeto

```
omni-studio/
├── index.html
├── css/style.css
├── js/
│   ├── app.js                 # orquestração, estado, abas, fluxos
│   ├── config.js              # configurações persistidas + idiomas
│   ├── api/
│   │   ├── client.js          # fetch base, /health, /v1/models, /props
│   │   ├── chat.js            # chat completions + streaming SSE multimodal
│   │   ├── tts.js             # síntese de voz via /tts (transporte único)
│   │   ├── tts-diag.js        # diagnóstico TTS (mesmo transporte + preflight)
│   │   └── realtime.js        # WebSocket /v1/realtime (conversa por voz)
│   ├── components/
│   │   ├── chat.js            # balões, markdown, anexos, players
│   │   ├── composer.js        # campo de mensagem, anexar, colar, arrastar
│   │   ├── audio.js           # gravação, WAV, resampling, player PCM
│   │   ├── voice.js           # VAD, dock único de voz, decode PCM16
│   │   ├── media.js           # arquivos → base64, previews
│   │   └── settings.js        # modal de configurações + teste de conexão
│   └── utils/
│       ├── md.js              # renderizador Markdown minimalista
│       ├── icons.js           # ícones SVG inline
│       ├── repeat.js          # detecção de repetição patológica
│       ├── guards.js          # guardas de geração (tamanho/stall/duração)
│       ├── id.js              # identificadores de solicitação
│       └── toast.js           # avisos
└── run.sh                     # servidor estático (python3)
```

---

## 4.1 Diagnóstico de TTS dentro do site

O endpoint `/tts` é validado pelo terminal (curl), mas o navegador pode
falhar por diferenças de transporte. Para comparar os dois caminhos sem
sair do site:

1. Abra **Configurações** → **Diagnosticar TTS**.
2. O diagnóstico usa o **MESMO transporte da produção** (`requestTtsOnce`
   → `apiFetch`), **sem simular preflight** (os headers
   `Origin`/`Access-Control-Request-*` são controlados pelo navegador e
   não devem ser definidos por script). Por padrão testa **UMA chamada por
   vez**; se falhar, acrescenta uma única repetição de observação.
3. Resultado no modal + `console.table` com: origem da página/servidor,
   requestId, slot antes/depois, status HTTP, Content-Type, tempo e erro
   classificado (network/http/abort/etc.).

Interpretação:
- Falhas **instantâneas (ms)** apontam para bloqueio de preflight/CORS ou
  conexão recusada → observe o painel Network da chamada real.
- Preflight OK + falha = transporte/rede.
- Leitura bem-sucedida do WAV (cross-origin) prova que CORS está OK naquele
  momento.

### Testes reais executados (17/11/2026, servidor local)

| Teste | Resultado |
|---|---|
| 3 chamadas TTS consecutivas (conexões novas) | 3/3 WAV válidos |
| 5 chamadas TTS na MESMA conexão TCP (cliente puro) | 5/5 WAV válidos |
| POST `/tts` com `Origin` simulada | 200 + `Access-Control-Allow-Origin` espelhado |
| OPTIONS `/tts` (preflight) com Origin | 200 + ACAO/Métodos/Headers liberados |
| Cancelamento real: fechar conexão durante geração longa | slot `processing=true` no instante 0 → **livre em ~3 s** |

### Loop de vídeo com áudio — causa comprovada e correção

Reproduzido via `POST /v1/chat/completions` (mesmo caminho do site) com o
vídeo de teste que contém narração: o modelo descreve corretamente o visual
e **depois entra em repetição patológica** (`umamolapadapada…`), até o
limite de tokens. O CLI (`llama cli`) não reproduz com este vídeo; o
defeito está no caminho HTTP/chat do servidor.

**Correção:** a instrução de vídeo agora é:

```
Answer questions about the video using what you see and hear. Do not
transcribe or repeat unintelligible speech; describe the visuals and
summarize the audio in general terms.
```

Testes reais de controle (mesmo vídeo com áudio):
- Prompt antigo, `max_tokens=768`: loop reproduzido.
- Prompt corrigido, `max_tokens=768` e `2048`: **sem repetição**, descrição
  visual auditiva correta, geração termina com EOS.
- Vídeo sem áudio: sem repetição (já era estável).

### Teto de tokens em vídeos

Análises de vídeo com trilha sonora podem entrar em repetição patológica no
servidor. Para encerrar a geração **no backend** (não só na apresentação),
mensagens com vídeo usam `max_tokens = min(configurado, 768)` — suficiente
para descrições completas (~500+ palavras), mas impede loops de milhares de
tokens. Este é o mecanismo **efetivo** contra o loop: o servidor para
sozinho ao atingir o limite do request.

### TTS: normalização e limite de duração

- O texto enviado ao `/tts` é **normalizado a partir do Markdown** (`js/utils/speech-text.js`):
  links viram texto descritivo; negrito/itálico/tachado/código perdem os marcadores;
  títulos, listas e citações preservam o conteúdo. A mensagem exibida/histórico
  não é alterada.
- O corpo do POST agora envia `n_predict` calculado proporcionalmente ao texto:
  `clamp(ceil(palavras × 10), 512, 4096)` frames (cada frame = 80 ms).
- **Estratégia híbrida:** textos com menos de 120 palavras usam uma única
  requisição (comportamento curto/médio preservado). Textos com 120+ palavras
  são divididos localmente em **blocos semânticos** (≤35 palavras; respeita
  parágrafos → sentenças → cláusulas → palavras, sem cortar palavras nem
  duplicar conteúdo), sintetizados **sequencialmente** e **concatenados** em
  um único WAV válido (PCM16, mesmo sample rate/canais, pausa de 150 ms entre
  blocos). Se um bloco falhar ou for truncado, a sequência é interrompida e
  nenhum áudio parcial é apresentado como completo.
- `repeat_penalty` não é mais enviado como override (volta ao padrão 1.05 do
  servidor) — a regra condicional foi removida por falta de benefício
  comprovado.
- **Cancelamento independente:** durante a geração textual, o botão principal
  do composer mostra "Parar" (interrompe o streaming — o `apiFetch` agora
  mantém o sinal externo conectado durante toda a leitura, incluindo o corpo
  SSE). Quando o TTS está sintetizando, a própria mensagem exibe um indicador
  discreto ("Gerando áudio · i/N" para blocos, ou spinner indeterminado em
  requisição única) com um botão "Parar" — cancela somente a síntese daquela
  mensagem, sem afetar o chat nem outras mensagens. Nenhum WAV parcial é
  apresentado como completo; após cancelar, o botão "ouvir" fica disponível
  novamente.
- **Respostas interrompidas continuam utilizáveis:** ao interromper o texto
  com "Parar", o conteúdo já gerado permanece na conversa com a indicação
  "(interrompido)" e continua elegível para síntese de voz — o botão
  "ouvir" fica disponível e, se a voz automática estiver ativada, o TTS
  inicia automaticamente com o texto parcial (uma única tentativa por
  encerramento textual; cancelável pelo controle próprio da mensagem).
- O teto máximo de 4096 frames (~327 s) é respeitado por bloco; se atingido,
  o bloco é tratado como falha de completude (nunca declarado completo).
- `finish_reason=length` (resposta textual cortada pelo limite de tokens) agora
  exibe na mensagem: *"Resposta interrompida ao atingir o limite de tokens
  configurado."* — sem continuação automática, sem alterar limites.

### Isolamento do backend (vídeo com/sem áudio)

O binário `llama` usa subcomando. O script já usa `llama cli`:

```bash
LLAMA_MODEL=/caminho/para/modelos/LFM3-Omni-2B-Q8_0.gguf \
LLAMA_MMPROJ=/caminho/para/modelos/mmproj-LFM3-Omni-2B-Q8_0.gguf \
./tools/video_tts_diag.sh /caminho/video-com-audio.mp4 /caminho/video-sem-audio.mp4
```

Ele executa: `ffprobe` (codec/taxa/canais), extração do áudio em WAV 24 kHz
mono, e inferências via `llama cli` (vídeo com áudio, vídeo sem áudio,
áudio isolado) com **`-n` (teto de tokens) e `timeout`**, capturando
stdout/stderr separadamente:
- `exit 124` = limite de tempo atingido (provável loop/geração longa);
- `exit ≠ 0` = erro de inicialização (mostra stderr real);
- repetição só é avaliada quando há saída útil.

Se o loop aparecer no CLI, é backend; se não aparecer, é da integração web.

### Servir a interface pela mesma origem (elimina CORS)

O llama.cpp serve arquivos estáticos via `--path`:

```bash
llama serve -m ... -mmproj ... --path . --port 8080
```

Abrindo `http://127.0.0.1:8080`, todas as requisições ficam same-origin —
mesmo comportamento do curl. Alternativa: adicionar
`--cors-origins http://127.0.0.1:5173` ao comando atual.

---

## 5. Limitações conhecidas (honestas)- **Interromper geração por texto:** a interface encerra o recebimento do
  streaming (aborta o `fetch`). O servidor libera o slot ao detectar a
  desconexão; o texto parcial é preservado e marcado como *interrompido*.
- **Conversa por voz:** a sessão WebSocket permanece aberta entre turnos —
  só é encerrada quando você toca em "Encerrar", troca de aba ou fecha a
  página. **Cada sessão de voz começa com contexto novo** no servidor (o
  modelo não "lembra" conversas anteriores de voz). A escuta contínua usa
  detecção de fala (VAD) com limiar fixo (RMS ≥ 0,010) e silêncio de
  650 ms; fala com menos de 300 ms é descartada como ruído. Se o ambiente
  for muito ruidoso, use a escuta por texto ou pause a escuta durante a
  resposta.
- **Transcrição da sua fala no modo voz:** o protocolo Realtime do llama.cpp
  não devolve a transcrição da fala do usuário em sessões de conversa
  (apenas em sessões de transcrição dedicadas). Por isso, no modo voz suas
  mensagens aparecem como bolhas de áudio, sem texto transcrito. Para
  transcrever um áudio, use o botão "🔤 transcrever" na aba Texto.
- **Vídeos grandes:** são enviados como base64 pela API; vídeos muito longos
  consomem bastante contexto (32K tokens) e memória. A interface avisa que o
  vídeo vai com "frames + trilha sonora", mas não há corte automático.
  **Verificação do lado do servidor:** o processamento de `input_video`
  depende de `ffmpeg` no `PATH` do processo do llama.cpp (não do navegador).
  Para validar o pipeline de vídeo do seu servidor, use o comando oficial da
  Liquid AI:
  ```bash
  llama cli -m LFM3-Omni-2B-Q8_0.gguf -mm mmproj-LFM3-Omni-2B-Q8_0.gguf \
    --video video.mp4 \
    -sys "Answer questions about the video using what you see and hear." \
    -p "What happens here, and what can you hear?" --temp 0
  ```
  Se o CLI mostrar frames + áudio e a interface não, o problema é o formato
  do bloco `input_video` — se o CLI também responder só sobre o áudio, o
  ajuste recomendado é `--video-fps` (mais frames por segundo) na
  inicialização do servidor.
- **`/tts`:** usa as vozes do próprio modelo (`female`/`male`). As chamadas
  são serializadas (uma por vez) com retry + backoff apenas para falhas que
  NÃO produziram síntese: falha de rede sem resposta ou HTTP 503 ("sem slot"
  — ex.: a análise de vídeo ainda ocupando o slot). Assim, uma solicitação
  gera no máximo um áudio, e falhas são reportadas com mensagem real (rede ×
  HTTP × timeout) e diagnóstico no console (endpoint, tempo, status). WAV
  vazio também é detectado.
- **Proteção contra geração descontrolada:** o frontend monitora o texto do
  streaming (texto e voz) e detecta repetição patológica (mesmo bloco
  repetido 6+ vezes) ou tamanho excessivo; nesses casos, a geração é
  interrompida automaticamente com aviso, sem limitar respostas normais
  longas e detalhadas.
- **Interrupção:** no modo Texto, o botão "Parar" aborta o `fetch` (o
  navegador encerra a conexão). Teste real com o servidor local: ao fechar
  a conexão durante uma geração longa, o slot ainda aparece `processing=true`
  no instante 0, mas **fica livre em ~3 s** — o backend cancela a tarefa ao
  detectar a desconexão. O reader SSE é cancelado explicitamente no
  frontend, eventos posteriores são descartados e o estado é restaurado. O
  probe `GET /slots` (1,5s e 5s após o abort) registra essa liberação no
  console.
- **Capacidades:** os botões não são desabilitados com base em suposições —
  são a interface de verificação (`/v1/models`) que informa as modalidades
  reais; se o servidor não expuser esses metadados, a interface assume que o
  modelo (carregado com `-mmproj`) suporta tudo.

## 6. Verificação manual (após as correções)

Estes itens dependem do servidor local e do microfone reais — não são
automatizáveis neste ambiente:

1. **Áudio único:** envie uma imagem, receba a resposta e clique em
   "ouvir" duas vezes seguidas — deve gerar **um** arquivo de áudio (o
   segundo clique apenas reproduz de novo).
2. **TTS repetido:** peça áudio em mensagens consecutivas (1ª, 2ª, 3ª…)
   — todas devem funcionar; nenhuma deve falhar depois da primeira. Se alguma
   falhar, o console mostra o diagnóstico (network/http/timeout, tempo,
   endpoint).
3. **Indicador:** durante a geração de voz, o botão mostra "gerando voz…" e
   volta a "ouvir novamente" ao terminar — nunca deve ficar preso.
4. **Vídeo:** envie um MP4 com objetos em movimento e narração **sem
   digitar pergunta** — a primeira resposta já deve descrever o visual e o
   áudio, e a geração deve terminar normalmente (sem repetição infinita).
5. **Cancelamento:** inicie uma geração de texto longa e aperte "Parar" —
   a interface para na hora, mostra "(interrompido)" e permite nova
   mensagem. Na aba Voz, "Parar" (barra superior) interrompe resposta e
   áudio.
6. **Modo voz contínuo:** aba Voz → "Escuta contínua" → fale sem tocar em
   nada; o modelo responde e volta a ouvir sozinho. A resposta textual deve
   aparecer em **uma única bolha legível**, sem barra/player de resposta
   falada abaixo da conversa; o campo de entrada continua funcionando; o
   botão superior "Encerrar" permanece.
7. **Regressões:** reconhecimento de imagem (Goku), gravação com microfone
   humano (transcrição via "🔤 transcrever") e chat de texto continuam
   funcionando.

---

## 6. Referências da pesquisa

- Modelo GGUF: <https://huggingface.co/LiquidAI/LFM3-Omni-2B-GGUF>
- Documentação Liquid AI (LFM3-Omni-2B):
  <https://docs.liquid.ai/lfm/models/lfm3-omni-2b>
- Blog Liquid AI (família LFM3): <https://www.liquid.ai/blog/lfm3>
- Servidor llama.cpp (endpoints, multimodal, realtime):
  <https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md>
- Multimodal no llama.cpp:
  <https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md>
- Exemplo de cliente `/v1/realtime`:
  <https://github.com/ggml-org/llama.cpp/blob/master/examples/realtime_client.py>
