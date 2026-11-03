# Vídeo local da oficina

O fundo usa filmagem real de um mecânico ajustando o motor de um carro em uma oficina. O enquadramento mostra mãos, ferramentas e motor; não há rosto em destaque, marca legível ou marca-d'água. A mídia foi baixada de uma fonte pública e preparada localmente.

## Origem e licença

Conferido em 21/10/2026:

- [Mechanic repairing a car engine, item 4716, Mixkit](https://mixkit.co/free-stock-video/mechanic-repairing-a-car-engine-4716/).
- [Download público de 720p](https://assets.mixkit.co/videos/4716/4716-720.mp4), 3.530.156 bytes, 1280 × 720, aproximadamente 11,61 s.
- [Mixkit Stock Video Free License](https://mixkit.co/license/modal/videoFree/) e [termos do Mixkit](https://mixkit.co/terms/).
- A página deste item identifica expressamente a licença **Free**, com uso comercial e pessoal. A licença permite baixar, modificar e incorporar o vídeo ao projeto, sem atribuição obrigatória. Este clipe foi incorporado como fundo do aplicativo; não é oferecido como biblioteca de stock ou revenda isolada.
- Não há crédito individual de autoria na página pública do item; a origem é registrada como Mixkit, sem atribuir um criador não informado.

O registro público com links, transformações e checksums está em `public/media/workshop-source.json`. A filmagem é genérica e não representa instalações ou funcionários do OScar.

## Arquivos utilizados pelo aplicativo

| Arquivo | Características | Tamanho |
| --- | --- | --- |
| `/media/workshop-loop.mp4` | MP4 H.264 High Level 3.1, yuv420p, 1280 × 720, 24 fps, 11 s, sem áudio, faststart | 1.742.115 bytes (~1,66 MiB) |
| `/media/workshop-poster.webp` | Primeiro quadro decodificado do MP4 preparado, WebP | 42.198 bytes (~41,2 KiB) |

O aplicativo deve referenciar esses caminhos locais. Não há iframe, hotlink ou serviço de vídeo externo em tempo de execução. O MP4 usa um codec compatível com navegadores comuns; a reprodução efetiva foi verificada em Chromium. Safari não foi executado neste ambiente.

## Preparação

O script `scripts/prepare-workshop-video.mjs` usa Node e os executáveis `ffmpeg`/`ffprobe` já disponíveis no PATH. Ele trabalha apenas com o arquivo local, verifica o SHA-256 da origem e gera o MP4, o poster e o manifesto. Não faz chamadas de rede.

O original fica em `data/video-source/mixkit-4716-source.mp4`. A pasta `data/` já é ignorada pelo Git e pela configuração de publicação. As páginas públicas de origem/licença, as prévias e as evidências de reprodução também ficam nessa pasta local.

Para obter novamente o original, se necessário, baixe o link público acima para esse caminho. Em PowerShell:

```powershell
New-Item -ItemType Directory -Force -Path data/video-source | Out-Null
Invoke-WebRequest -UseBasicParsing -Uri 'https://assets.mixkit.co/videos/4716/4716-720.mp4' -OutFile 'data/video-source/mixkit-4716-source.mp4'
node scripts/prepare-workshop-video.mjs
```

SHA-256 do download conferido: `8f300ab6bd9bfebb29757afd641e3a0c1a567802c68acff2f83ef32abcda787d`.

As edições são: conversão de aproximadamente 29,97 para 24 fps, brilho -0,035, saturação 0,82, contraste 1,03 e remoção de metadados. O conteúdo principal vai de 0,5 a 11,5 s da origem. Nos últimos 0,5 s há uma fusão com os primeiros 0,5 s da origem, de modo que o fim do vídeo antecede o primeiro quadro ao repetir. Nenhum quadro sintético de oficina foi inserido. A silhueta do motor, as luvas e o movimento das mãos continuam visíveis; o tratamento final de contraste do formulário fica no CSS da tela.

## Verificação realizada

- `ffprobe`: 11,000 s, um único stream H.264, 1280 × 720, 24 fps, sem stream de áudio.
- Seis quadros amostrados ao longo do clipe têm checksums diferentes.
- Reprodução nativa com `autoplay muted loop playsinline`, em servidor ligado somente a `127.0.0.1`, no Chromium 153.0.8010.12.
- Movimento verificado comparando pixels dos quadros em 1 s e 3 s: diferença RGB média de 37,27 em escala de 0 a 255, com movimento visível das mãos e do corpo.
- Loop nativo verificado: começou em 10,70 s e, um segundo depois, estava em 0,70 s, continuando em reprodução e sem erro de mídia.
- Nenhuma requisição externa durante essa verificação. Poster e quadros da filmagem foram inspecionados visualmente.

Evidências locais: `data/video-source/workshop-validation.json` e `data/video-source/workshop-browser-preview.png`.
