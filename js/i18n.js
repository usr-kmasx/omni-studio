// UI translations. Model prompts and model-generated content intentionally stay untouched.
export const availableLocales = ['en', 'pt', 'es', 'fr', 'de'];

const en = {
  'settings.title': 'Settings', 'settings.close': 'Close', 'settings.connection': 'Connection',
  'settings.backend': 'llama.cpp', 'settings.serverAddress': 'Server address',
  'settings.appearance': 'Appearance', 'settings.theme': 'Theme', 'theme.system': 'Follow system',
  'theme.light': 'Light', 'theme.dark': 'Dark', 'theme.nord': 'Nord',
  'settings.language': 'App language', 'settings.voice': 'Voice',
  'settings.ttsLanguage': 'Response language', 'settings.asrLanguage': 'Transcription language',
  'settings.voiceType': 'Voice', 'voice.female': 'Female', 'voice.male': 'Male',
  'settings.autoSpeak': 'Speak responses automatically', 'settings.cancel': 'Cancel', 'settings.save': 'Save',
  'language.auto': 'Automatic', 'tab.text': 'Chat', 'tab.voice': 'Voice',
  'status.connecting': 'connecting…', 'status.online': 'online', 'status.offline': 'offline',
  'status.processing': 'processing…', 'status.modelLoaded': 'Model loaded', 'status.serverOffline': 'Server offline',
  'status.verify': 'Check server connection', 'status.unavailable': 'Server unavailable. Check the address under Settings → llama.cpp.',
  'action.newChat': 'New conversation', 'action.settings': 'Settings',
  'composer.placeholder': 'Type your message…', 'composer.attachImage': 'Attach image',
  'composer.attachAudio': 'Attach audio', 'composer.attachVideo': 'Attach video',
  'composer.record': 'Record voice message', 'composer.send': 'Send', 'composer.stop': 'Stop generation',
  'composer.transcribe': 'Transcribe this audio (ASR)', 'composer.transcribeAction': 'Transcribe',
  'composer.remove': 'Remove', 'composer.transcribing': 'Transcribing…',
  'composer.transcriptInserted': 'Transcript added to the text field.', 'composer.noTranscript': 'The model returned no transcript.',
  'composer.transcriptionFailed': 'Transcription failed.', 'composer.recordFailed': 'Could not finish recording.',
  'composer.recording': 'Recording… click the microphone to stop.', 'composer.micUnavailable': 'Microphone unavailable or permission denied.',
  'composer.interrupted': 'Interrupt generation', 'composer.unsupported': 'Unsupported file format: {name}',
  'hero.textTitle': 'Chat with your Omni model', 'hero.textBody': 'Send text, images, audio, or video. The model understands them together and can reply with text or speech.',
  'hero.voiceTitle': 'Voice conversation', 'hero.voiceBody': 'Continuous listening with speech detection: tap “Continuous listening”, speak, and the model replies with text and voice. Each session starts a new context.',
  'media.image': 'image', 'media.audio': 'audio', 'media.video': 'video', 'media.voice': 'voice', 'media.speech': 'speech',
  'voice.mode': 'Real-time voice mode.', 'voice.listen': 'Continuous listening', 'voice.pause': 'Pause listening',
  'voice.cancel': 'Stop response', 'voice.cancelTitle': 'Stop generation or playing audio', 'voice.end': 'End',
  'voice.endTitle': 'End voice session', 'voice.reconnect': 'Reconnect', 'voice.placeholder': 'Or type during the voice conversation…',
  'voice.send': 'Send text', 'voice.reconnected': 'Session reconnected.', 'voice.connecting': 'Connecting to voice session…',
  'voice.ready': 'Session ready.', 'voice.connectFailed': 'Could not connect to voice session.',
  'voice.timeout': 'The response took too long — you can try again.', 'voice.ended': 'Session ended. Tap “Continuous listening” to start a new one.',
  'voice.sessionError': 'Voice session ended (error).', 'voice.sessionEnded': 'Voice session ended.',
  'voice.speaking': 'Speaking…', 'voice.listening': 'Listening… speak normally.', 'voice.paused': 'Listening paused.',
  'voice.vadFailed': 'Microphone unavailable or could not load VAD.', 'voice.bargeIn': 'Interrupting the response to hear you…',
  'voice.processingSpeech': 'Processing your speech…', 'voice.unavailable': 'Voice session unavailable.',
  'voice.processing': 'Processing…', 'voice.generating': 'Generating response…',
  'voice.repeatStopped': 'Repetition detected — generation stopped.', 'voice.repeatToast': 'Abnormal repetition detected — generation stopped automatically.',
  'chat.playPause': 'Play/pause', 'chat.downloadAudio': 'Download audio', 'chat.volume': 'Volume',
  'chat.play': 'Play', 'chat.pause': 'Pause', 'chat.transcript': 'transcript', 'chat.videoFrames': 'video · frames + soundtrack',
  'chat.processing': 'processing', 'chat.generatingAudio': 'Generating audio · {index}/{total}',
  'chat.generatingAudioEllipsis': 'Generating audio…', 'chat.stopAudio': 'Stop', 'chat.stopSynthesis': 'Stop audio synthesis',
  'chat.listenResponse': 'Listen to response (model speech synthesis)', 'chat.listen': 'listen',
  'chat.generatingVoice': 'generating voice…', 'chat.listenAgain': 'listen again',
  'chat.audioInterrupted': 'Audio interrupted.', 'chat.voiceFailed': 'Failed to generate speech.',
  'chat.copied': '✓ copied', 'chat.tokensContext': 'tokens · {percent}% of context',
  'backend.title': 'llama.cpp', 'backend.back': 'Back to settings', 'backend.external': 'Local server',
  'backend.externalHint': 'Server managed outside Omni Studio. It takes priority when available.',
  'backend.integrated': 'Omni Studio llama.cpp', 'backend.installation': 'Installation:', 'backend.activation': 'Activation:',
  'backend.process': 'Process:', 'backend.version': 'Version:', 'backend.variant': 'Variant:', 'backend.folder': 'Folder:',
  'backend.installed': 'installed', 'backend.notInstalled': 'not installed', 'backend.enabled': 'enabled',
  'backend.disabled': 'disabled', 'backend.running': 'running', 'backend.installing': 'installing…',
  'backend.stopped': 'stopped', 'backend.active': 'Enabled', 'backend.checking': 'Checking status…',
  'backend.serverRunning': 'Server running', 'backend.serverStopped': 'Server stopped', 'backend.starting': 'Starting…',
  'backend.stopping': 'Stopping…', 'backend.serverError': 'Server error', 'backend.statusUnavailable': 'Status unavailable',
  'backend.start': 'Start server', 'backend.stop': 'Stop server', 'backend.waiting': 'Waiting…',
  'backend.install': 'Install backend (b12202)', 'backend.delete': 'Delete installation', 'backend.confirmDelete': 'Confirm deletion?',
  'backend.applyNextStart': 'Will apply on next startup.', 'backend.files': 'Model and files',
  'backend.modelFile': 'GGUF model', 'backend.projector': 'Image projector', 'backend.optional': '· optional',
  'backend.noneSelected': 'None selected', 'backend.choose': 'Choose', 'backend.change': 'Change', 'backend.clear': 'Clear',
  'backend.gpu': 'GPU and processing', 'backend.gpuLayers': 'GPU layers (-ngl)', 'backend.threads': 'Threads (-t)',
  'backend.batchThreads': 'Batch threads (-tb)', 'backend.memory': 'Memory and context', 'backend.context': 'Context (-c)',
  'backend.batch': 'Batch (-b)', 'backend.ubatch': 'Ubatch (-ub)', 'backend.cacheK': 'Cache K (-ctk)',
  'backend.cacheV': 'Cache V (-ctv)', 'backend.flashAttention': 'Flash attention (-fa)', 'backend.server': 'Server',
  'backend.host': 'Host (--host)', 'backend.port': 'Port (--port; blank = free)', 'backend.slots': 'Slots (-np)',
  'backend.reasoning': 'Reasoning (--reasoning)', 'backend.cors': 'CORS (--cors-origins)', 'backend.paramInvalid': 'Invalid parameter.',
  'backend.gpuValidation': 'GPU layers: use all, auto, or an integer between 0 and 4294967295.',
  'backend.contextValidation': 'Context: enter an integer between 1024 and 4294967295.',
  'backend.portValidation': 'Port: enter an integer between 1 and 65535 or leave blank.',
  'backend.integerValidation': 'Enter a positive integer or leave blank to use the default.',
  'backend.saveActivationFailed': 'Could not save backend activation.', 'backend.confirmSwitch': 'A generation is active. Switching models will interrupt it, stop the integrated server, and start the new model. Continue?',
  'backend.selectFailed': 'Failed to select file.', 'backend.modelRestarted': 'New model loaded; integrated server restarted.',
  'backend.externalKept': 'External server kept running. The selected model applies to the integrated backend.',
  'backend.stopConfirm': 'A generation is active. Cancel it and stop the server?', 'backend.stopFailed': 'Failed to stop server.',
  'backend.download': 'Downloading precompiled package…', 'backend.installDone': 'Installation complete.',
  'backend.installFailed': 'Installation failed.', 'backend.fileUnavailable': '· File unavailable',
  'backend.startFailed': 'Failed to start server.', 'backend.close': 'Close', 'backend.noWebui': '--no-webui',
};

const translations = {
  en,
  pt: {
    'settings.title':'Configurações','settings.close':'Fechar','settings.connection':'Conexão','settings.backend':'llama.cpp','settings.serverAddress':'Endereço do servidor','settings.appearance':'Aparência','settings.theme':'Tema','theme.system':'Seguir tema do sistema','theme.light':'Claro','theme.dark':'Escuro','theme.nord':'Nord','settings.language':'Idioma do aplicativo','settings.voice':'Voz','settings.ttsLanguage':'Idioma da resposta','settings.asrLanguage':'Idioma da transcrição','settings.voiceType':'Voz','voice.female':'Feminina','voice.male':'Masculina','settings.autoSpeak':'Falar respostas automaticamente','settings.cancel':'Cancelar','settings.save':'Salvar','language.auto':'Automático','tab.text':'Chat','tab.voice':'Voz','status.connecting':'conectando…','status.online':'online','status.offline':'offline','status.processing':'processando…','status.modelLoaded':'Modelo carregado','status.serverOffline':'Servidor offline','status.verify':'Verificar conexão com o servidor','status.unavailable':'Servidor indisponível. Confira o endereço em Configurações → llama.cpp.','action.newChat':'Nova conversa','action.settings':'Configurações','composer.placeholder':'Digite sua mensagem…','composer.attachImage':'Anexar imagem','composer.attachAudio':'Anexar áudio','composer.attachVideo':'Anexar vídeo','composer.record':'Gravar mensagem de voz','composer.send':'Enviar','composer.stop':'Interromper geração','composer.transcribe':'Transcrever este áudio (ASR)','composer.transcribeAction':'Transcrever','composer.remove':'Remover','composer.transcribing':'transcrevendo…','composer.transcriptInserted':'Transcrição inserida no campo de texto.','composer.noTranscript':'O modelo não retornou transcrição.','composer.transcriptionFailed':'Falha na transcrição.','composer.recordFailed':'Falha ao finalizar a gravação.','composer.recording':'Gravando… clique no microfone para encerrar.','composer.micUnavailable':'Microfone indisponível ou sem permissão.','composer.interrupted':'Interromper geração','composer.unsupported':'Formato não suportado: {name}','hero.textTitle':'Converse com seu modelo Omni','hero.textBody':'Envie texto, imagens, áudio ou vídeo. O modelo entende tudo junto e pode responder com texto ou fala.','hero.voiceTitle':'Conversa por voz','hero.voiceBody':'Escuta contínua com detecção de fala: toque em “Escuta contínua”, fale, e o modelo responde com texto e voz. Cada sessão começa um novo contexto.','media.image':'imagem','media.audio':'áudio','media.video':'vídeo','media.voice':'voz','media.speech':'fala','voice.mode':'Modo de voz em tempo real.','voice.listen':'Escuta contínua','voice.pause':'Pausar escuta','voice.cancel':'Parar resposta','voice.cancelTitle':'Parar a geração ou o áudio em reprodução','voice.end':'Encerrar','voice.endTitle':'Encerrar sessão de voz','voice.reconnect':'Reconectar','voice.placeholder':'Ou digite durante a conversa por voz…','voice.send':'Enviar texto','voice.reconnected':'Sessão reconectada.','voice.connecting':'Conectando à sessão de voz…','voice.ready':'Sessão pronta.','voice.connectFailed':'Não foi possível conectar à sessão de voz.','voice.timeout':'A resposta demorou demais — você pode tentar de novo.','voice.ended':'Sessão encerrada. Toque em “Escuta contínua” para iniciar uma nova.','voice.sessionError':'Sessão de voz encerrada (erro).','voice.sessionEnded':'Sessão de voz encerrada.','voice.speaking':'Falando…','voice.listening':'Ouvindo… fale normalmente.','voice.paused':'Escuta pausada.','voice.vadFailed':'Microfone indisponível ou não foi possível carregar o VAD.','voice.bargeIn':'Interrompendo a resposta para ouvir você…','voice.processingSpeech':'Processando sua fala…','voice.unavailable':'Sessão de voz indisponível.','voice.processing':'Processando…','voice.generating':'Gerando resposta…','voice.repeatStopped':'Repetição detectada — geração interrompida.','voice.repeatToast':'Repetição patológica detectada — geração interrompida automaticamente.','chat.playPause':'Reproduzir/pausar','chat.downloadAudio':'Baixar áudio','chat.volume':'Volume','chat.play':'Reproduzir','chat.pause':'Pausar','chat.transcript':'transcrição','chat.videoFrames':'vídeo · frames + trilha sonora','chat.processing':'processando','chat.generatingAudio':'Gerando áudio · {index}/{total}','chat.generatingAudioEllipsis':'Gerando áudio…','chat.stopAudio':'Parar','chat.stopSynthesis':'Interromper síntese de áudio','chat.listenResponse':'Ouvir resposta (síntese de voz do modelo)','chat.listen':'ouvir','chat.generatingVoice':'gerando voz…','chat.listenAgain':'ouvir novamente','chat.audioInterrupted':'Áudio interrompido.','chat.voiceFailed':'Falha ao gerar voz.','chat.copied':'✓ copiado','chat.tokensContext':'tokens · {percent}% do contexto','backend.title':'llama.cpp','backend.back':'Voltar às configurações','backend.external':'Servidor local','backend.externalHint':'Servidor gerenciado fora do Omni Studio. Tem prioridade quando disponível.','backend.integrated':'llama.cpp do Omni Studio','backend.installation':'Instalação:','backend.activation':'Ativação:','backend.process':'Processo:','backend.version':'Versão:','backend.variant':'Variante:','backend.folder':'Pasta:','backend.installed':'instalada','backend.notInstalled':'não instalada','backend.enabled':'ativado','backend.disabled':'desativado','backend.running':'rodando','backend.installing':'instalando…','backend.stopped':'parado','backend.active':'Ativado','backend.checking':'Verificando status…','backend.serverRunning':'Servidor em execução','backend.serverStopped':'Servidor parado','backend.starting':'Iniciando…','backend.stopping':'Parando…','backend.serverError':'Erro no servidor','backend.statusUnavailable':'Estado indisponível','backend.start':'Iniciar servidor','backend.stop':'Parar servidor','backend.waiting':'Aguardando…','backend.install':'Instalar backend (b12202)','backend.delete':'Excluir instalação','backend.confirmDelete':'Confirmar exclusão?','backend.applyNextStart':'Será aplicado na próxima inicialização.','backend.files':'Modelo e arquivos','backend.modelFile':'Modelo GGUF','backend.projector':'Projetor de imagem','backend.optional':'· opcional','backend.noneSelected':'Nenhum selecionado','backend.choose':'Escolher','backend.change':'Trocar','backend.clear':'Limpar','backend.gpu':'GPU e processamento','backend.gpuLayers':'Camadas na GPU (-ngl)','backend.threads':'Threads (-t)','backend.batchThreads':'Threads de batch (-tb)','backend.memory':'Memória e contexto','backend.context':'Contexto (-c)','backend.batch':'Batch (-b)','backend.ubatch':'Ubatch (-ub)','backend.cacheK':'Cache K (-ctk)','backend.cacheV':'Cache V (-ctv)','backend.flashAttention':'Flash attention (-fa)','backend.server':'Servidor','backend.host':'Host (--host)','backend.port':'Porta (--port; vazio = livre)','backend.slots':'Slots (-np)','backend.reasoning':'Reasoning (--reasoning)','backend.cors':'CORS (--cors-origins)','backend.paramInvalid':'Parâmetro inválido.','backend.gpuValidation':'Camadas na GPU: use all, auto ou um inteiro entre 0 e 4294967295.','backend.contextValidation':'Contexto: informe um inteiro entre 1024 e 4294967295.','backend.portValidation':'Porta: informe um inteiro entre 1 e 65535 ou deixe vazio.','backend.integerValidation':'Informe um inteiro positivo ou deixe o campo vazio para usar o padrão.','backend.saveActivationFailed':'Não foi possível salvar a ativação do backend.','backend.confirmSwitch':'Há uma geração ativa. Trocar o modelo vai interrompê-la, parar o servidor integrado e iniciar o novo modelo. Continuar?','backend.selectFailed':'Falha ao selecionar arquivo.','backend.modelRestarted':'Novo modelo carregado; servidor integrado reiniciado.','backend.externalKept':'Servidor externo mantido. O modelo selecionado vale para o backend integrado.','backend.stopConfirm':'Há uma geração ativa. Deseja cancelá-la e parar o servidor?','backend.stopFailed':'Falha ao parar o servidor.','backend.download':'Baixando pacote pré-compilado…','backend.installDone':'Instalação concluída.','backend.installFailed':'Falha na instalação.','backend.fileUnavailable':'· Arquivo indisponível','backend.startFailed':'Falha ao iniciar o servidor.','backend.close':'Fechar','backend.noWebui':'--no-webui'
  },
  es: {
    'settings.title':'Configuración','settings.close':'Cerrar','settings.connection':'Conexión','settings.backend':'llama.cpp','settings.serverAddress':'Dirección del servidor','settings.appearance':'Apariencia','settings.theme':'Tema','theme.system':'Seguir el tema del sistema','theme.light':'Claro','theme.dark':'Oscuro','theme.nord':'Nord','settings.language':'Idioma de la aplicación','settings.voice':'Voz','settings.ttsLanguage':'Idioma de respuesta','settings.asrLanguage':'Idioma de transcripción','settings.voiceType':'Voz','voice.female':'Femenina','voice.male':'Masculina','settings.autoSpeak':'Leer respuestas automáticamente','settings.cancel':'Cancelar','settings.save':'Guardar','language.auto':'Automático','tab.text':'Chat','tab.voice':'Voz','status.connecting':'conectando…','status.online':'en línea','status.offline':'sin conexión','status.processing':'procesando…','status.modelLoaded':'Modelo cargado','status.serverOffline':'Servidor sin conexión','status.verify':'Comprobar conexión con el servidor','status.unavailable':'Servidor no disponible. Comprueba la dirección en Ajustes → llama.cpp.','action.newChat':'Nueva conversación','action.settings':'Configuración','composer.placeholder':'Escribe tu mensaje…','composer.attachImage':'Adjuntar imagen','composer.attachAudio':'Adjuntar audio','composer.attachVideo':'Adjuntar vídeo','composer.record':'Grabar mensaje de voz','composer.send':'Enviar','composer.stop':'Detener generación','composer.transcribe':'Transcribir este audio (ASR)','composer.transcribeAction':'Transcribir','composer.remove':'Quitar','composer.transcribing':'transcribiendo…','composer.transcriptInserted':'Transcripción añadida al campo de texto.','composer.noTranscript':'El modelo no devolvió una transcripción.','composer.transcriptionFailed':'Error al transcribir.','composer.recordFailed':'No se pudo finalizar la grabación.','composer.recording':'Grabando… pulsa el micrófono para terminar.','composer.micUnavailable':'Micrófono no disponible o permiso denegado.','composer.interrupted':'Interrumpir generación','composer.unsupported':'Formato no compatible: {name}','hero.textTitle':'Chatea con tu modelo Omni','hero.textBody':'Envía texto, imágenes, audio o vídeo. El modelo los entiende juntos y puede responder con texto o voz.','hero.voiceTitle':'Conversación por voz','hero.voiceBody':'Escucha continua con detección de voz: pulsa “Escucha continua”, habla y el modelo responderá con texto y voz. Cada sesión inicia un contexto nuevo.','media.image':'imagen','media.audio':'audio','media.video':'vídeo','media.voice':'voz','media.speech':'habla','voice.mode':'Modo de voz en tiempo real.','voice.listen':'Escucha continua','voice.pause':'Pausar escucha','voice.cancel':'Detener respuesta','voice.cancelTitle':'Detener la generación o el audio en reproducción','voice.end':'Finalizar','voice.endTitle':'Finalizar sesión de voz','voice.reconnect':'Reconectar','voice.placeholder':'O escribe durante la conversación de voz…','voice.send':'Enviar texto','voice.reconnected':'Sesión reconectada.','voice.connecting':'Conectando a la sesión de voz…','voice.ready':'Sesión lista.','voice.connectFailed':'No se pudo conectar a la sesión de voz.','voice.timeout':'La respuesta tardó demasiado; puedes intentarlo de nuevo.','voice.ended':'Sesión finalizada. Pulsa “Escucha continua” para iniciar otra.','voice.sessionError':'Sesión de voz finalizada (error).','voice.sessionEnded':'Sesión de voz finalizada.','voice.speaking':'Hablando…','voice.listening':'Escuchando… habla con normalidad.','voice.paused':'Escucha pausada.','voice.vadFailed':'Micrófono no disponible o no se pudo cargar VAD.','voice.bargeIn':'Interrumpiendo la respuesta para escucharte…','voice.processingSpeech':'Procesando tu voz…','voice.unavailable':'Sesión de voz no disponible.','voice.processing':'Procesando…','voice.generating':'Generando respuesta…','voice.repeatStopped':'Repetición detectada: generación detenida.','voice.repeatToast':'Repetición anómala detectada: generación detenida automáticamente.','chat.playPause':'Reproducir/pausar','chat.downloadAudio':'Descargar audio','chat.volume':'Volumen','chat.play':'Reproducir','chat.pause':'Pausar','chat.transcript':'transcripción','chat.videoFrames':'vídeo · fotogramas + banda sonora','chat.processing':'procesando','chat.generatingAudio':'Generando audio · {index}/{total}','chat.generatingAudioEllipsis':'Generando audio…','chat.stopAudio':'Detener','chat.stopSynthesis':'Detener síntesis de audio','chat.listenResponse':'Escuchar respuesta (síntesis de voz del modelo)','chat.listen':'escuchar','chat.generatingVoice':'generando voz…','chat.listenAgain':'escuchar de nuevo','chat.audioInterrupted':'Audio interrumpido.','chat.voiceFailed':'Error al generar voz.','chat.copied':'✓ copiado','chat.tokensContext':'tokens · {percent}% del contexto',
  },
  fr: {
    'settings.title':'Paramètres','settings.close':'Fermer','settings.connection':'Connexion','settings.backend':'llama.cpp','settings.serverAddress':'Adresse du serveur','settings.appearance':'Apparence','settings.theme':'Thème','theme.system':'Suivre le thème du système','theme.light':'Clair','theme.dark':'Sombre','theme.nord':'Nord','settings.language':'Langue de l’application','settings.voice':'Voix','settings.ttsLanguage':'Langue de réponse','settings.asrLanguage':'Langue de transcription','settings.voiceType':'Voix','voice.female':'Féminine','voice.male':'Masculine','settings.autoSpeak':'Lire automatiquement les réponses','settings.cancel':'Annuler','settings.save':'Enregistrer','language.auto':'Automatique','tab.text':'Chat','tab.voice':'Voix','status.connecting':'connexion…','status.online':'en ligne','status.offline':'hors ligne','status.processing':'traitement…','status.modelLoaded':'Modèle chargé','status.serverOffline':'Serveur hors ligne','status.verify':'Vérifier la connexion au serveur','status.unavailable':'Serveur indisponible. Vérifiez l’adresse dans Paramètres → llama.cpp.','action.newChat':'Nouvelle conversation','action.settings':'Paramètres','composer.placeholder':'Écrivez votre message…','composer.attachImage':'Joindre une image','composer.attachAudio':'Joindre un audio','composer.attachVideo':'Joindre une vidéo','composer.record':'Enregistrer un message vocal','composer.send':'Envoyer','composer.stop':'Arrêter la génération','composer.transcribe':'Transcrire cet audio (ASR)','composer.transcribeAction':'Transcrire','composer.remove':'Supprimer','composer.transcribing':'transcription…','composer.transcriptInserted':'Transcription ajoutée au champ de texte.','composer.noTranscript':'Le modèle n’a renvoyé aucune transcription.','composer.transcriptionFailed':'Échec de la transcription.','composer.recordFailed':'Impossible de terminer l’enregistrement.','composer.recording':'Enregistrement… cliquez sur le micro pour terminer.','composer.micUnavailable':'Microphone indisponible ou autorisation refusée.','composer.interrupted':'Interrompre la génération','composer.unsupported':'Format non pris en charge : {name}','hero.textTitle':'Discutez avec votre modèle Omni','hero.textBody':'Envoyez du texte, des images, de l’audio ou de la vidéo. Le modèle les comprend ensemble et peut répondre par écrit ou à voix haute.','hero.voiceTitle':'Conversation vocale','hero.voiceBody':'Écoute continue avec détection de la parole : touchez « Écoute continue », parlez et le modèle répondra par écrit et à voix haute. Chaque session démarre un nouveau contexte.','media.image':'image','media.audio':'audio','media.video':'vidéo','media.voice':'voix','media.speech':'parole','voice.mode':'Mode vocal en temps réel.','voice.listen':'Écoute continue','voice.pause':'Mettre l’écoute en pause','voice.cancel':'Arrêter la réponse','voice.cancelTitle':'Arrêter la génération ou la lecture audio','voice.end':'Terminer','voice.endTitle':'Terminer la session vocale','voice.reconnect':'Reconnecter','voice.placeholder':'Ou saisissez du texte pendant la conversation vocale…','voice.send':'Envoyer le texte','voice.reconnected':'Session reconnectée.','voice.connecting':'Connexion à la session vocale…','voice.ready':'Session prête.','voice.connectFailed':'Impossible de se connecter à la session vocale.','voice.timeout':'La réponse a pris trop de temps — réessayez.','voice.ended':'Session terminée. Touchez « Écoute continue » pour en démarrer une nouvelle.','voice.sessionError':'Session vocale terminée (erreur).','voice.sessionEnded':'Session vocale terminée.','voice.speaking':'Parole…','voice.listening':'À l’écoute… parlez normalement.','voice.paused':'Écoute en pause.','voice.vadFailed':'Microphone indisponible ou impossible de charger le VAD.','voice.bargeIn':'Interruption de la réponse pour vous écouter…','voice.processingSpeech':'Traitement de votre parole…','voice.unavailable':'Session vocale indisponible.','voice.processing':'Traitement…','voice.generating':'Génération de la réponse…','voice.repeatStopped':'Répétition détectée — génération arrêtée.','voice.repeatToast':'Répétition anormale détectée — génération arrêtée automatiquement.','chat.playPause':'Lire/mettre en pause','chat.downloadAudio':'Télécharger l’audio','chat.volume':'Volume','chat.play':'Lire','chat.pause':'Pause','chat.transcript':'transcription','chat.videoFrames':'vidéo · images + bande-son','chat.processing':'traitement','chat.generatingAudio':'Génération audio · {index}/{total}','chat.generatingAudioEllipsis':'Génération audio…','chat.stopAudio':'Arrêter','chat.stopSynthesis':'Interrompre la synthèse vocale','chat.listenResponse':'Écouter la réponse (synthèse vocale du modèle)','chat.listen':'écouter','chat.generatingVoice':'génération vocale…','chat.listenAgain':'écouter à nouveau','chat.audioInterrupted':'Audio interrompu.','chat.voiceFailed':'Échec de la synthèse vocale.','chat.copied':'✓ copié','chat.tokensContext':'jetons · {percent}% du contexte',
  },
  de: {
    'settings.title':'Einstellungen','settings.close':'Schließen','settings.connection':'Verbindung','settings.backend':'llama.cpp','settings.serverAddress':'Serveradresse','settings.appearance':'Darstellung','settings.theme':'Design','theme.system':'Systemdesign verwenden','theme.light':'Hell','theme.dark':'Dunkel','theme.nord':'Nord','settings.language':'App-Sprache','settings.voice':'Sprache','settings.ttsLanguage':'Antwortsprache','settings.asrLanguage':'Transkriptionssprache','settings.voiceType':'Stimme','voice.female':'Weiblich','voice.male':'Männlich','settings.autoSpeak':'Antworten automatisch vorlesen','settings.cancel':'Abbrechen','settings.save':'Speichern','language.auto':'Automatisch','tab.text':'Chat','tab.voice':'Sprache','status.connecting':'verbinden…','status.online':'online','status.offline':'offline','status.processing':'wird verarbeitet…','status.modelLoaded':'Modell geladen','status.serverOffline':'Server offline','status.verify':'Serververbindung prüfen','status.unavailable':'Server nicht verfügbar. Prüfe die Adresse unter Einstellungen → llama.cpp.','action.newChat':'Neues Gespräch','action.settings':'Einstellungen','composer.placeholder':'Schreib deine Nachricht…','composer.attachImage':'Bild anhängen','composer.attachAudio':'Audio anhängen','composer.attachVideo':'Video anhängen','composer.record':'Sprachnachricht aufnehmen','composer.send':'Senden','composer.stop':'Generierung stoppen','composer.transcribe':'Dieses Audio transkribieren (ASR)','composer.transcribeAction':'Transkribieren','composer.remove':'Entfernen','composer.transcribing':'transkribiere…','composer.transcriptInserted':'Transkript in das Textfeld eingefügt.','composer.noTranscript':'Das Modell hat kein Transkript zurückgegeben.','composer.transcriptionFailed':'Transkription fehlgeschlagen.','composer.recordFailed':'Aufnahme konnte nicht beendet werden.','composer.recording':'Aufnahme… zum Beenden auf das Mikrofon klicken.','composer.micUnavailable':'Mikrofon nicht verfügbar oder Berechtigung verweigert.','composer.interrupted':'Generierung unterbrechen','composer.unsupported':'Nicht unterstütztes Dateiformat: {name}','hero.textTitle':'Chatte mit deinem Omni-Modell','hero.textBody':'Sende Text, Bilder, Audio oder Video. Das Modell versteht sie gemeinsam und kann mit Text oder Sprache antworten.','hero.voiceTitle':'Sprachgespräch','hero.voiceBody':'Dauerhaftes Zuhören mit Spracherkennung: Tippe auf „Dauerhaft zuhören“, sprich, und das Modell antwortet mit Text und Sprache. Jede Sitzung beginnt mit einem neuen Kontext.','media.image':'Bild','media.audio':'Audio','media.video':'Video','media.voice':'Sprache','media.speech':'Sprachausgabe','voice.mode':'Echtzeit-Sprachmodus.','voice.listen':'Dauerhaft zuhören','voice.pause':'Zuhören pausieren','voice.cancel':'Antwort stoppen','voice.cancelTitle':'Generierung oder Audiowiedergabe stoppen','voice.end':'Beenden','voice.endTitle':'Sprachsitzung beenden','voice.reconnect':'Neu verbinden','voice.placeholder':'Oder tippe während des Sprachgesprächs…','voice.send':'Text senden','voice.reconnected':'Sitzung wieder verbunden.','voice.connecting':'Verbindung zur Sprachsitzung…','voice.ready':'Sitzung bereit.','voice.connectFailed':'Verbindung zur Sprachsitzung fehlgeschlagen.','voice.timeout':'Die Antwort dauerte zu lange — versuche es erneut.','voice.ended':'Sitzung beendet. Tippe auf „Dauerhaft zuhören“, um eine neue zu starten.','voice.sessionError':'Sprachsitzung beendet (Fehler).','voice.sessionEnded':'Sprachsitzung beendet.','voice.speaking':'Spricht…','voice.listening':'Hört zu… sprich ganz normal.','voice.paused':'Zuhören pausiert.','voice.vadFailed':'Mikrofon nicht verfügbar oder VAD konnte nicht geladen werden.','voice.bargeIn':'Antwort wird unterbrochen, um dir zuzuhören…','voice.processingSpeech':'Sprache wird verarbeitet…','voice.unavailable':'Sprachsitzung nicht verfügbar.','voice.processing':'Wird verarbeitet…','voice.generating':'Antwort wird erstellt…','voice.repeatStopped':'Wiederholung erkannt — Generierung gestoppt.','voice.repeatToast':'Ungewöhnliche Wiederholung erkannt — Generierung automatisch gestoppt.','chat.playPause':'Abspielen/Pausieren','chat.downloadAudio':'Audio herunterladen','chat.volume':'Lautstärke','chat.play':'Abspielen','chat.pause':'Pausieren','chat.transcript':'Transkript','chat.videoFrames':'Video · Einzelbilder + Tonspur','chat.processing':'wird verarbeitet','chat.generatingAudio':'Audio wird erzeugt · {index}/{total}','chat.generatingAudioEllipsis':'Audio wird erzeugt…','chat.stopAudio':'Stopp','chat.stopSynthesis':'Spracherzeugung abbrechen','chat.listenResponse':'Antwort anhören (Sprachausgabe des Modells)','chat.listen':'anhören','chat.generatingVoice':'Stimme wird erzeugt…','chat.listenAgain':'erneut anhören','chat.audioInterrupted':'Audio unterbrochen.','chat.voiceFailed':'Sprachausgabe fehlgeschlagen.','chat.copied':'✓ kopiert','chat.tokensContext':'Tokens · {percent}% des Kontexts',
  },
};

Object.assign(en, {
  'backend.connected':'connected', 'backend.unavailable':'unavailable', 'backend.state':'Status',
  'voice.responseInterrupted':'Response interrupted.', 'voice.promptListen':'Ready. Tap “Continuous listening” to begin.',
  'voice.promptNext':'Ready. A new voice session will start when you speak.', 'voice.answered':'Answered.',
  'composer.transcriptAborted':'Transcription interrupted.', 'composer.asrFailure':'Could not transcribe the recording. Try again.',
  'composer.prepareFailed':'Could not prepare “{name}”.', 'status.modelTooltip':'Model: {id}\nInputs: {inputs}\nOutputs: {outputs}',
});
Object.assign(translations.pt, {
  'backend.connected':'conectado', 'backend.unavailable':'indisponível', 'backend.state':'Estado',
  'voice.responseInterrupted':'Resposta interrompida.', 'voice.promptListen':'Pronto. Toque em “Escuta contínua” para começar.',
  'voice.promptNext':'Pronto. Uma nova sessão de voz começará quando você falar.', 'voice.answered':'Respondido.',
  'composer.transcriptAborted':'Transcrição interrompida.', 'composer.asrFailure':'Não foi possível transcrever a gravação. Tente novamente.',
  'composer.prepareFailed':'Não foi possível preparar “{name}”.', 'status.modelTooltip':'Modelo: {id}\nEntradas: {inputs}\nSaídas: {outputs}',
});
Object.assign(translations.es, {
  'backend.connected':'conectado', 'backend.unavailable':'no disponible', 'backend.state':'Estado',
  'voice.responseInterrupted':'Respuesta interrumpida.', 'voice.promptListen':'Listo. Pulsa “Escucha continua” para empezar.',
  'voice.promptNext':'Listo. Se iniciará una nueva sesión de voz cuando hables.', 'voice.answered':'Respondido.',
  'composer.transcriptAborted':'Transcripción interrumpida.', 'composer.asrFailure':'No se pudo transcribir la grabación. Inténtalo de nuevo.',
  'composer.prepareFailed':'No se pudo preparar “{name}”.', 'status.modelTooltip':'Modelo: {id}\nEntradas: {inputs}\nSalidas: {outputs}',
  'backend.title':'llama.cpp','backend.back':'Volver a Configuración','backend.external':'Servidor local','backend.externalHint':'Servidor administrado fuera de Omni Studio. Tiene prioridad cuando está disponible.','backend.integrated':'llama.cpp de Omni Studio','backend.installation':'Instalación:','backend.activation':'Activación:','backend.process':'Proceso:','backend.version':'Versión:','backend.variant':'Variante:','backend.folder':'Carpeta:','backend.installed':'instalada','backend.notInstalled':'no instalada','backend.enabled':'activado','backend.disabled':'desactivado','backend.running':'en ejecución','backend.installing':'instalando…','backend.stopped':'detenido','backend.active':'Activado','backend.checking':'Comprobando estado…','backend.serverRunning':'Servidor en ejecución','backend.serverStopped':'Servidor detenido','backend.starting':'Iniciando…','backend.stopping':'Deteniendo…','backend.serverError':'Error del servidor','backend.statusUnavailable':'Estado no disponible','backend.start':'Iniciar servidor','backend.stop':'Detener servidor','backend.waiting':'Esperando…','backend.install':'Instalar backend (b12202)','backend.delete':'Eliminar instalación','backend.confirmDelete':'¿Confirmar eliminación?','backend.applyNextStart':'Se aplicará en el próximo inicio.','backend.files':'Modelo y archivos','backend.modelFile':'Modelo GGUF','backend.projector':'Proyector de imagen','backend.optional':'· opcional','backend.noneSelected':'Ninguno seleccionado','backend.choose':'Elegir','backend.change':'Cambiar','backend.clear':'Limpiar','backend.gpu':'GPU y procesamiento','backend.gpuLayers':'Capas en GPU (-ngl)','backend.threads':'Hilos (-t)','backend.batchThreads':'Hilos por lote (-tb)','backend.memory':'Memoria y contexto','backend.context':'Contexto (-c)','backend.batch':'Lote (-b)','backend.ubatch':'Ubatch (-ub)','backend.cacheK':'Caché K (-ctk)','backend.cacheV':'Caché V (-ctv)','backend.flashAttention':'Atención flash (-fa)','backend.server':'Servidor','backend.host':'Host (--host)','backend.port':'Puerto (--port; vacío = libre)','backend.slots':'Slots (-np)','backend.reasoning':'Razonamiento (--reasoning)','backend.cors':'CORS (--cors-origins)','backend.paramInvalid':'Parámetro no válido.','backend.gpuValidation':'Capas GPU: usa all, auto o un entero entre 0 y 4294967295.','backend.contextValidation':'Contexto: introduce un entero entre 1024 y 4294967295.','backend.portValidation':'Puerto: introduce un entero entre 1 y 65535 o déjalo vacío.','backend.integerValidation':'Introduce un entero positivo o deja el campo vacío para usar el valor predeterminado.','backend.saveActivationFailed':'No se pudo guardar la activación del backend.','backend.confirmSwitch':'Hay una generación activa. Cambiar el modelo la interrumpirá, detendrá el servidor integrado e iniciará el nuevo modelo. ¿Continuar?','backend.selectFailed':'No se pudo seleccionar el archivo.','backend.modelRestarted':'Modelo nuevo cargado; servidor integrado reiniciado.','backend.externalKept':'El servidor externo sigue activo. El modelo seleccionado se aplica al backend integrado.','backend.stopConfirm':'Hay una generación activa. ¿Quieres cancelarla y detener el servidor?','backend.stopFailed':'No se pudo detener el servidor.','backend.download':'Descargando paquete precompilado…','backend.installDone':'Instalación completada.','backend.installFailed':'Error en la instalación.','backend.fileUnavailable':'· Archivo no disponible','backend.startFailed':'No se pudo iniciar el servidor.','backend.close':'Cerrar','backend.noWebui':'--no-webui',
});
Object.assign(translations.fr, {
  'backend.connected':'connecté', 'backend.unavailable':'indisponible', 'backend.state':'État',
  'voice.responseInterrupted':'Réponse interrompue.', 'voice.promptListen':'Prêt. Touchez « Écoute continue » pour commencer.',
  'voice.promptNext':'Prêt. Une nouvelle session vocale démarrera quand vous parlerez.', 'voice.answered':'Répondu.',
  'composer.transcriptAborted':'Transcription interrompue.', 'composer.asrFailure':'Impossible de transcrire l’enregistrement. Réessayez.',
  'composer.prepareFailed':'Impossible de préparer « {name} ».', 'status.modelTooltip':'Modèle : {id}\nEntrées : {inputs}\nSorties : {outputs}',
  'backend.title':'llama.cpp','backend.back':'Retour aux paramètres','backend.external':'Serveur local','backend.externalHint':'Serveur géré en dehors d’Omni Studio. Prioritaire lorsqu’il est disponible.','backend.integrated':'llama.cpp d’Omni Studio','backend.installation':'Installation :','backend.activation':'Activation :','backend.process':'Processus :','backend.version':'Version :','backend.variant':'Variante :','backend.folder':'Dossier :','backend.installed':'installé','backend.notInstalled':'non installé','backend.enabled':'activé','backend.disabled':'désactivé','backend.running':'en cours','backend.installing':'installation…','backend.stopped':'arrêté','backend.active':'Activé','backend.checking':'Vérification de l’état…','backend.serverRunning':'Serveur en cours','backend.serverStopped':'Serveur arrêté','backend.starting':'Démarrage…','backend.stopping':'Arrêt…','backend.serverError':'Erreur du serveur','backend.statusUnavailable':'État indisponible','backend.start':'Démarrer le serveur','backend.stop':'Arrêter le serveur','backend.waiting':'Patientez…','backend.install':'Installer le backend (b12202)','backend.delete':'Supprimer l’installation','backend.confirmDelete':'Confirmer la suppression ?','backend.applyNextStart':'Sera appliqué au prochain démarrage.','backend.files':'Modèle et fichiers','backend.modelFile':'Modèle GGUF','backend.projector':'Projecteur d’image','backend.optional':'· facultatif','backend.noneSelected':'Aucun sélectionné','backend.choose':'Choisir','backend.change':'Modifier','backend.clear':'Effacer','backend.gpu':'GPU et traitement','backend.gpuLayers':'Couches GPU (-ngl)','backend.threads':'Threads (-t)','backend.batchThreads':'Threads de batch (-tb)','backend.memory':'Mémoire et contexte','backend.context':'Contexte (-c)','backend.batch':'Batch (-b)','backend.ubatch':'Ubatch (-ub)','backend.cacheK':'Cache K (-ctk)','backend.cacheV':'Cache V (-ctv)','backend.flashAttention':'Attention flash (-fa)','backend.server':'Serveur','backend.host':'Hôte (--host)','backend.port':'Port (--port ; vide = libre)','backend.slots':'Slots (-np)','backend.reasoning':'Raisonnement (--reasoning)','backend.cors':'CORS (--cors-origins)','backend.paramInvalid':'Paramètre invalide.','backend.gpuValidation':'Couches GPU : utilisez all, auto ou un entier entre 0 et 4294967295.','backend.contextValidation':'Contexte : saisissez un entier entre 1024 et 4294967295.','backend.portValidation':'Port : saisissez un entier entre 1 et 65535 ou laissez vide.','backend.integerValidation':'Saisissez un entier positif ou laissez le champ vide pour utiliser la valeur par défaut.','backend.saveActivationFailed':'Impossible d’enregistrer l’activation du backend.','backend.confirmSwitch':'Une génération est en cours. Changer de modèle va l’interrompre, arrêter le serveur intégré et démarrer le nouveau modèle. Continuer ?','backend.selectFailed':'Impossible de sélectionner le fichier.','backend.modelRestarted':'Nouveau modèle chargé ; serveur intégré redémarré.','backend.externalKept':'Le serveur externe reste actif. Le modèle sélectionné s’applique au backend intégré.','backend.stopConfirm':'Une génération est en cours. Voulez-vous l’annuler et arrêter le serveur ?','backend.stopFailed':'Impossible d’arrêter le serveur.','backend.download':'Téléchargement du paquet précompilé…','backend.installDone':'Installation terminée.','backend.installFailed':'Échec de l’installation.','backend.fileUnavailable':'· Fichier indisponible','backend.startFailed':'Impossible de démarrer le serveur.','backend.close':'Fermer','backend.noWebui':'--no-webui',
});
Object.assign(translations.de, {
  'backend.connected':'verbunden', 'backend.unavailable':'nicht verfügbar', 'backend.state':'Status',
  'voice.responseInterrupted':'Antwort unterbrochen.', 'voice.promptListen':'Bereit. Tippe auf „Dauerhaft zuhören“, um zu beginnen.',
  'voice.promptNext':'Bereit. Eine neue Sprachsitzung startet, wenn du sprichst.', 'voice.answered':'Beantwortet.',
  'composer.transcriptAborted':'Transkription unterbrochen.', 'composer.asrFailure':'Aufnahme konnte nicht transkribiert werden. Versuche es erneut.',
  'composer.prepareFailed':'„{name}“ konnte nicht vorbereitet werden.', 'status.modelTooltip':'Modell: {id}\nEingaben: {inputs}\nAusgaben: {outputs}',
  'backend.title':'llama.cpp','backend.back':'Zurück zu den Einstellungen','backend.external':'Lokaler Server','backend.externalHint':'Außerhalb von Omni Studio verwalteter Server. Wird bevorzugt, wenn verfügbar.','backend.integrated':'Omni Studio llama.cpp','backend.installation':'Installation:','backend.activation':'Aktivierung:','backend.process':'Prozess:','backend.version':'Version:','backend.variant':'Variante:','backend.folder':'Ordner:','backend.installed':'installiert','backend.notInstalled':'nicht installiert','backend.enabled':'aktiviert','backend.disabled':'deaktiviert','backend.running':'läuft','backend.installing':'wird installiert…','backend.stopped':'gestoppt','backend.active':'Aktiviert','backend.checking':'Status wird geprüft…','backend.serverRunning':'Server läuft','backend.serverStopped':'Server gestoppt','backend.starting':'Wird gestartet…','backend.stopping':'Wird beendet…','backend.serverError':'Serverfehler','backend.statusUnavailable':'Status nicht verfügbar','backend.start':'Server starten','backend.stop':'Server stoppen','backend.waiting':'Warten…','backend.install':'Backend installieren (b12202)','backend.delete':'Installation löschen','backend.confirmDelete':'Löschen bestätigen?','backend.applyNextStart':'Wird beim nächsten Start angewendet.','backend.files':'Modell und Dateien','backend.modelFile':'GGUF-Modell','backend.projector':'Bildprojektor','backend.optional':'· optional','backend.noneSelected':'Nichts ausgewählt','backend.choose':'Auswählen','backend.change':'Ändern','backend.clear':'Leeren','backend.gpu':'GPU und Verarbeitung','backend.gpuLayers':'GPU-Ebenen (-ngl)','backend.threads':'Threads (-t)','backend.batchThreads':'Batch-Threads (-tb)','backend.memory':'Speicher und Kontext','backend.context':'Kontext (-c)','backend.batch':'Batch (-b)','backend.ubatch':'Ubatch (-ub)','backend.cacheK':'Cache K (-ctk)','backend.cacheV':'Cache V (-ctv)','backend.flashAttention':'Flash Attention (-fa)','backend.server':'Server','backend.host':'Host (--host)','backend.port':'Port (--port; leer = frei)','backend.slots':'Slots (-np)','backend.reasoning':'Reasoning (--reasoning)','backend.cors':'CORS (--cors-origins)','backend.paramInvalid':'Ungültiger Parameter.','backend.gpuValidation':'GPU-Ebenen: all, auto oder eine Zahl zwischen 0 und 4294967295 verwenden.','backend.contextValidation':'Kontext: eine Zahl zwischen 1024 und 4294967295 eingeben.','backend.portValidation':'Port: eine Zahl zwischen 1 und 65535 eingeben oder leer lassen.','backend.integerValidation':'Eine positive Zahl eingeben oder für den Standardwert leer lassen.','backend.saveActivationFailed':'Backend-Aktivierung konnte nicht gespeichert werden.','backend.confirmSwitch':'Eine Generierung läuft. Beim Modellwechsel wird sie unterbrochen, der integrierte Server gestoppt und das neue Modell gestartet. Fortfahren?','backend.selectFailed':'Datei konnte nicht ausgewählt werden.','backend.modelRestarted':'Neues Modell geladen; integrierter Server neu gestartet.','backend.externalKept':'Externer Server bleibt aktiv. Das gewählte Modell gilt für das integrierte Backend.','backend.stopConfirm':'Eine Generierung läuft. Abbrechen und den Server stoppen?','backend.stopFailed':'Server konnte nicht gestoppt werden.','backend.download':'Vorkompiliertes Paket wird heruntergeladen…','backend.installDone':'Installation abgeschlossen.','backend.installFailed':'Installation fehlgeschlagen.','backend.fileUnavailable':'· Datei nicht verfügbar','backend.startFailed':'Server konnte nicht gestartet werden.','backend.close':'Schließen','backend.noWebui':'--no-webui',
});

const guardTranslations = {
  en: { 'guard.interruptedNote':'(interrupted)', 'guard.lengthNote':'(safety output limit reached)', 'guard.stallNote':'(generation stopped responding)', 'guard.durationNote':'(maximum generation time reached)', 'guard.interruptedToast':'Generation interrupted.', 'guard.lengthToast':'Safety output limit reached — generation stopped.', 'guard.stallToast':'Generation stopped responding — interrupted automatically.', 'guard.durationToast':'Maximum generation time reached — interrupted automatically.' },
  pt: { 'guard.interruptedNote':'(interrompido)', 'guard.lengthNote':'(limite de segurança de saída atingido)', 'guard.stallNote':'(a geração parou de responder)', 'guard.durationNote':'(tempo máximo de geração atingido)', 'guard.interruptedToast':'Geração interrompida.', 'guard.lengthToast':'Limite de segurança de saída atingido — geração interrompida.', 'guard.stallToast':'A geração parou de responder — interrompida automaticamente.', 'guard.durationToast':'Tempo máximo de geração atingido — interrompida automaticamente.' },
  es: { 'guard.interruptedNote':'(interrumpido)', 'guard.lengthNote':'(se alcanzó el límite seguro de salida)', 'guard.stallNote':'(la generación dejó de responder)', 'guard.durationNote':'(se alcanzó el tiempo máximo de generación)', 'guard.interruptedToast':'Generación interrumpida.', 'guard.lengthToast':'Se alcanzó el límite seguro de salida: generación detenida.', 'guard.stallToast':'La generación dejó de responder: se detuvo automáticamente.', 'guard.durationToast':'Se alcanzó el tiempo máximo: generación detenida automáticamente.' },
  fr: { 'guard.interruptedNote':'(interrompu)', 'guard.lengthNote':'(limite de sortie de sécurité atteinte)', 'guard.stallNote':'(la génération ne répondait plus)', 'guard.durationNote':'(durée maximale de génération atteinte)', 'guard.interruptedToast':'Génération interrompue.', 'guard.lengthToast':'Limite de sortie de sécurité atteinte — génération arrêtée.', 'guard.stallToast':'La génération ne répondait plus — arrêt automatique.', 'guard.durationToast':'Durée maximale atteinte — génération arrêtée automatiquement.' },
  de: { 'guard.interruptedNote':'(unterbrochen)', 'guard.lengthNote':'(Sicherheitslimit für die Ausgabe erreicht)', 'guard.stallNote':'(Generierung reagierte nicht mehr)', 'guard.durationNote':'(maximale Generierungsdauer erreicht)', 'guard.interruptedToast':'Generierung unterbrochen.', 'guard.lengthToast':'Sicherheitslimit erreicht — Generierung gestoppt.', 'guard.stallToast':'Generierung reagierte nicht mehr — automatisch gestoppt.', 'guard.durationToast':'Maximale Dauer erreicht — Generierung automatisch gestoppt.' },
};
for (const [language, entries] of Object.entries(guardTranslations)) Object.assign(translations[language], entries);
const remainingUiText = {
  en: { 'backend.rpcTimeout':'Timed out waiting for a response.', 'voice.repeatInterrupted':'(interrupted — repetition detected)', 'media.text':'text' },
  pt: { 'backend.rpcTimeout':'Tempo esgotado aguardando resposta.', 'voice.repeatInterrupted':'(interrompido — repetição detectada)', 'media.text':'texto' },
  es: { 'backend.rpcTimeout':'Se agotó el tiempo de espera de la respuesta.', 'voice.repeatInterrupted':'(interrumpido: se detectó una repetición)', 'media.text':'texto' },
  fr: { 'backend.rpcTimeout':'Délai dépassé en attendant la réponse.', 'voice.repeatInterrupted':'(interrompu — répétition détectée)', 'media.text':'texte' },
  de: { 'backend.rpcTimeout':'Zeitüberschreitung beim Warten auf eine Antwort.', 'voice.repeatInterrupted':'(unterbrochen — Wiederholung erkannt)', 'media.text':'Text' },
};
for (const [language, entries] of Object.entries(remainingUiText)) Object.assign(translations[language], entries);

let locale = 'en';
export function getLocale() { return locale; }
export function missingTranslationKeys(targetLocale) {
  return Object.keys(en).filter((key) => !translations[targetLocale]?.[key]);
}
const documentTranslations = {
  "en": {
    "composer.attachDocument": "Attach document",
    "media.document": "document",
    "composer.documentInvalid": "Could not read “{name}”. The file may be damaged or protected.",
    "composer.documentEmpty": "“{name}” has no extractable text. Scanned pages need OCR."
  },
  "pt": {
    "composer.attachDocument": "Anexar documento",
    "media.document": "documento",
    "composer.documentInvalid": "Não foi possível ler “{name}”. O arquivo pode estar corrompido ou protegido.",
    "composer.documentEmpty": "“{name}” não tem texto extraível. Páginas digitalizadas exigem OCR."
  },
  "es": {
    "composer.attachDocument": "Adjuntar documento",
    "media.document": "documento",
    "composer.documentInvalid": "No se pudo leer «{name}». El archivo puede estar dañado o protegido.",
    "composer.documentEmpty": "«{name}» no contiene texto extraíble. Las páginas escaneadas requieren OCR."
  },
  "fr": {
    "composer.attachDocument": "Joindre un document",
    "media.document": "document",
    "composer.documentInvalid": "Impossible de lire « {name} ». Le fichier est peut-être endommagé ou protégé.",
    "composer.documentEmpty": "« {name} » ne contient aucun texte extractible. Les pages numérisées nécessitent une OCR."
  },
  "de": {
    "composer.attachDocument": "Dokument anhängen",
    "media.document": "Dokument",
    "composer.documentInvalid": "„{name}“ konnte nicht gelesen werden. Die Datei ist möglicherweise beschädigt oder geschützt.",
    "composer.documentEmpty": "„{name}“ enthält keinen extrahierbaren Text. Gescannte Seiten benötigen OCR."
  }
};
for (const [language, entries] of Object.entries(documentTranslations)) Object.assign(translations[language], entries);

const liveLabels = {
  en: ['Start Live', 'End Live', 'Cancel recording'],
  pt: ['Iniciar Live', 'Encerrar Live', 'Cancelar gravação'],
  es: ['Iniciar conversación en vivo', 'Finalizar conversación en vivo', 'Cancelar grabación'],
  fr: ['Démarrer le direct', 'Terminer le direct', 'Annuler l’enregistrement'],
  de: ['Livegespräch starten', 'Livegespräch beenden', 'Aufnahme abbrechen'],
};
for (const [language, [start, end, cancelRecording]] of Object.entries(liveLabels)) {
  Object.assign(translations[language], { 'voice.liveStart': start, 'voice.liveEnd': end, 'composer.cancelRecording': cancelRecording });
}

const backendSaveLabels = {
  en: ['Settings saved. They take effect on the next server start.', 'Could not save server settings.'],
  pt: ['Parâmetros salvos. Entram em vigor na próxima inicialização do servidor.', 'Não foi possível salvar os parâmetros do servidor.'],
  es: ['Parámetros guardados. Se aplicarán la próxima vez que se inicie el servidor.', 'No se pudieron guardar los parámetros del servidor.'],
  fr: ['Paramètres enregistrés. Ils seront appliqués au prochain démarrage du serveur.', 'Impossible d’enregistrer les paramètres du serveur.'],
  de: ['Parameter gespeichert. Sie gelten beim nächsten Serverstart.', 'Die Serverparameter konnten nicht gespeichert werden.'],
};
for (const [language, [saved, failed]] of Object.entries(backendSaveLabels)) {
  Object.assign(translations[language], { 'backend.paramsSaved': saved, 'backend.saveParamsFailed': failed });
}

const backendRestartLabels = {
  en: ['Saving…', 'Settings saved. Server restarted.', 'Settings saved, but the server could not restart.', 'A response is in progress. Save settings and restart the server?'],
  pt: ['Salvando…', 'Parâmetros salvos. Servidor reiniciado.', 'Parâmetros salvos, mas o servidor não pôde reiniciar.', 'Há uma resposta em andamento. Salvar os parâmetros e reiniciar o servidor?'],
  es: ['Guardando…', 'Parámetros guardados. Servidor reiniciado.', 'Parámetros guardados, pero el servidor no pudo reiniciarse.', 'Hay una respuesta en curso. ¿Guardar los parámetros y reiniciar el servidor?'],
  fr: ['Enregistrement…', 'Paramètres enregistrés. Serveur redémarré.', 'Paramètres enregistrés, mais le serveur n’a pas pu redémarrer.', 'Une réponse est en cours. Enregistrer les paramètres et redémarrer le serveur ?'],
  de: ['Wird gespeichert…', 'Parameter gespeichert. Server neu gestartet.', 'Parameter gespeichert, aber der Server konnte nicht neu starten.', 'Eine Antwort läuft. Parameter speichern und den Server neu starten?'],
};
for (const [language, [saving, restarted, failed, confirm]] of Object.entries(backendRestartLabels)) {
  Object.assign(translations[language], {
    'backend.savingParams': saving, 'backend.savedRestarted': restarted,
    'backend.savedRestartFailed': failed, 'backend.confirmSaveRestart': confirm,
  });
}

const reasoningLabels = {
  en: ['Processing your prompt', 'Reasoning preview'],
  pt: ['Processando sua mensagem', 'Prévia do raciocínio'],
  es: ['Procesando tu mensaje', 'Vista previa del razonamiento'],
  fr: ['Traitement de votre message', 'Aperçu du raisonnement'],
  de: ['Deine Nachricht wird verarbeitet', 'Vorschau der Gedankenschritte'],
};
for (const [language, [processing, preview]] of Object.entries(reasoningLabels)) {
  Object.assign(translations[language], { 'chat.processingPrompt': processing, 'chat.reasoningPreview': preview });
}

const hfTranslations = {
  "en": {
    "hf.title": "Hugging Face",
    "hf.back": "Back to settings",
    "hf.backCatalog": "Back to models",
    "hf.trending": "Trending models",
    "hf.variants": "Choose a GGUF variant",
    "hf.loading": "Loading…",
    "hf.download": "Download",
    "hf.projector": "Image projector",
    "hf.parts": "{count} parts",
    "hf.unknownSize": "Size unknown",
    "hf.chooseFolder": "Choose a download folder",
    "hf.downloading": "Downloading…",
    "hf.done": "Download complete. Saved in {folder}.",
    "hf.empty": "No public models found.",
    "hf.emptyVariants": "No downloadable weight files found.",
    "hf.native": "Downloads are available in the desktop app.",
    "hf.network": "Could not reach Hugging Face. Try again.",
    "hf.folderError": "Could not use or save this folder.",
    "hf.busy": "A download is already in progress.",
    "hf.exists": "A file with this name already exists in the selected folder.",
    "hf.space": "There is not enough space in the selected folder.",
    "hf.variantMissing": "This variant has changed. Open the model again.",
    "hf.downloadError": "Could not finish the download."
  },
  "pt": {
    "hf.title": "Hugging Face",
    "hf.back": "Voltar às configurações",
    "hf.backCatalog": "Voltar aos modelos",
    "hf.trending": "Modelos em alta",
    "hf.variants": "Escolher variante GGUF",
    "hf.loading": "Carregando…",
    "hf.download": "Baixar",
    "hf.projector": "Projetor de imagem",
    "hf.parts": "{count} partes",
    "hf.unknownSize": "Tamanho desconhecido",
    "hf.chooseFolder": "Escolher pasta de download",
    "hf.downloading": "Baixando…",
    "hf.done": "Download concluído. Arquivos em {folder}.",
    "hf.empty": "Nenhum modelo público encontrado.",
    "hf.emptyVariants": "Nenhum arquivo de pesos disponível para download.",
    "hf.native": "Os downloads estão disponíveis no aplicativo para desktop.",
    "hf.network": "Não foi possível acessar o Hugging Face. Tente novamente.",
    "hf.folderError": "Não foi possível usar ou salvar esta pasta.",
    "hf.busy": "Já existe um download em andamento.",
    "hf.exists": "Já existe um arquivo com este nome na pasta selecionada.",
    "hf.space": "Não há espaço suficiente na pasta selecionada.",
    "hf.variantMissing": "Esta variante mudou. Abra o modelo novamente.",
    "hf.downloadError": "Não foi possível concluir o download."
  },
  "es": {
    "hf.title": "Hugging Face",
    "hf.back": "Volver a los ajustes",
    "hf.backCatalog": "Volver a los modelos",
    "hf.trending": "Modelos en tendencia",
    "hf.variants": "Elegir variante GGUF",
    "hf.loading": "Cargando…",
    "hf.download": "Descargar",
    "hf.projector": "Proyector de imagen",
    "hf.parts": "{count} partes",
    "hf.unknownSize": "Tamaño desconocido",
    "hf.chooseFolder": "Elegir carpeta de descarga",
    "hf.downloading": "Descargando…",
    "hf.done": "Descarga completa. Archivos en {folder}.",
    "hf.empty": "No se encontraron modelos públicos.",
    "hf.emptyVariants": "No hay variantes disponibles para descargar.",
    "hf.native": "Las descargas están disponibles en la aplicación de escritorio.",
    "hf.network": "No se pudo acceder a Hugging Face. Inténtalo de nuevo.",
    "hf.folderError": "No se pudo usar ni guardar esta carpeta.",
    "hf.busy": "Ya hay una descarga en curso.",
    "hf.exists": "Ya existe un archivo con este nombre en la carpeta seleccionada.",
    "hf.space": "No hay espacio suficiente en la carpeta seleccionada.",
    "hf.variantMissing": "Esta variante cambió. Vuelve a abrir el modelo.",
    "hf.downloadError": "No se pudo completar la descarga."
  },
  "fr": {
    "hf.title": "Hugging Face",
    "hf.back": "Retour aux paramètres",
    "hf.backCatalog": "Retour aux modèles",
    "hf.trending": "Modèles en vogue",
    "hf.variants": "Choisir une variante GGUF",
    "hf.loading": "Chargement…",
    "hf.download": "Télécharger",
    "hf.projector": "Projecteur d’image",
    "hf.parts": "{count} parties",
    "hf.unknownSize": "Taille inconnue",
    "hf.chooseFolder": "Choisir le dossier de téléchargement",
    "hf.downloading": "Téléchargement…",
    "hf.done": "Téléchargement terminé. Fichiers dans {folder}.",
    "hf.empty": "Aucun modèle public trouvé.",
    "hf.emptyVariants": "Aucune variante disponible au téléchargement.",
    "hf.native": "Les téléchargements sont disponibles dans l’application de bureau.",
    "hf.network": "Impossible de joindre Hugging Face. Réessayez.",
    "hf.folderError": "Impossible d’utiliser ou d’enregistrer ce dossier.",
    "hf.busy": "Un téléchargement est déjà en cours.",
    "hf.exists": "Un fichier portant ce nom existe déjà dans le dossier choisi.",
    "hf.space": "L’espace est insuffisant dans le dossier choisi.",
    "hf.variantMissing": "Cette variante a changé. Rouvrez le modèle.",
    "hf.downloadError": "Impossible de terminer le téléchargement."
  },
  "de": {
    "hf.title": "Hugging Face",
    "hf.back": "Zurück zu den Einstellungen",
    "hf.backCatalog": "Zurück zu den Modellen",
    "hf.trending": "Angesagte Modelle",
    "hf.variants": "GGUF-Variante auswählen",
    "hf.loading": "Wird geladen…",
    "hf.download": "Herunterladen",
    "hf.projector": "Bildprojektor",
    "hf.parts": "{count} Teile",
    "hf.unknownSize": "Größe unbekannt",
    "hf.chooseFolder": "Downloadordner auswählen",
    "hf.downloading": "Wird heruntergeladen…",
    "hf.done": "Download abgeschlossen. Dateien in {folder}.",
    "hf.empty": "Keine öffentlichen Modelle gefunden.",
    "hf.emptyVariants": "Keine-Varianten zum Download verfügbar.",
    "hf.native": "Downloads sind in der Desktop-App verfügbar.",
    "hf.network": "Hugging Face ist nicht erreichbar. Erneut versuchen.",
    "hf.folderError": "Dieser Ordner konnte nicht verwendet oder gespeichert werden.",
    "hf.busy": "Ein Download läuft bereits.",
    "hf.exists": "Eine Datei mit diesem Namen existiert bereits im gewählten Ordner.",
    "hf.space": "Der gewählte Ordner hat nicht genug freien Speicherplatz.",
    "hf.variantMissing": "Diese Variante hat sich geändert. Öffne das Modell erneut.",
    "hf.downloadError": "Der Download konnte nicht abgeschlossen werden."
  }
};
for (const [language, entries] of Object.entries(hfTranslations)) Object.assign(translations[language], entries);

const hfDiscoveryTranslations = {
  "en": {
    "hf.intro": "Browse models from Hugging Face and choose which files to download.",
    "hf.search": "Search by model or author",
    "hf.searchResults": "Search results",
    "hf.emptySearch": "No models matched your search.",
    "hf.selectedCount": "{count} selected",
    "hf.selectedSize": "{count} selected · {size}",
    "hf.downloadSelected": "Download selected",
    "hf.description": "Official description",
    "hf.repository": "Open repository in browser",
    "hf.batchProgress": "Downloading {index} of {count}…",
    "hf.batchFinished": "Download finished with issues. Destination: {folder}.",
    "hf.itemDone": "Downloaded",
    "hf.linkError": "Could not open the link."
  },
  "pt": {
    "hf.intro": "Explore os modelos do Hugging Face e escolha quais arquivos baixar.",
    "hf.search": "Pesquisar por modelo ou autor",
    "hf.searchResults": "Resultados da pesquisa",
    "hf.emptySearch": "Nenhum modelo encontrado para esta pesquisa.",
    "hf.selectedCount": "{count} selecionados",
    "hf.selectedSize": "{count} selecionados · {size}",
    "hf.downloadSelected": "Baixar selecionados",
    "hf.description": "Descrição oficial",
    "hf.repository": "Abrir repositório no navegador",
    "hf.batchProgress": "Baixando {index} de {count}…",
    "hf.batchFinished": "Download concluído com ocorrências. Destino: {folder}.",
    "hf.itemDone": "Baixado",
    "hf.linkError": "Não foi possível abrir o link."
  },
  "es": {
    "hf.intro": "Explora los modelos de Hugging Face y elige qué archivos descargar.",
    "hf.search": "Buscar por modelo o autor",
    "hf.searchResults": "Resultados de búsqueda",
    "hf.emptySearch": "No se encontraron modelos para esta búsqueda.",
    "hf.selectedCount": "{count} seleccionados",
    "hf.selectedSize": "{count} seleccionados · {size}",
    "hf.downloadSelected": "Descargar selección",
    "hf.description": "Descripción oficial",
    "hf.repository": "Abrir repositorio en el navegador",
    "hf.batchProgress": "Descargando {index} de {count}…",
    "hf.batchFinished": "Descarga finalizada con incidencias. Destino: {folder}.",
    "hf.itemDone": "Descargado",
    "hf.linkError": "No se pudo abrir el enlace."
  },
  "fr": {
    "hf.intro": "Parcourez les modèles de Hugging Face et choisissez les fichiers à télécharger.",
    "hf.search": "Rechercher par modèle ou auteur",
    "hf.searchResults": "Résultats de recherche",
    "hf.emptySearch": "Aucun modèle ne correspond à cette recherche.",
    "hf.selectedCount": "{count} sélectionnés",
    "hf.selectedSize": "{count} sélectionnés · {size}",
    "hf.downloadSelected": "Télécharger la sélection",
    "hf.description": "Description officielle",
    "hf.repository": "Ouvrir le dépôt dans le navigateur",
    "hf.batchProgress": "Téléchargement {index} sur {count}…",
    "hf.batchFinished": "Téléchargement terminé avec des incidents. Destination : {folder}.",
    "hf.itemDone": "Téléchargé",
    "hf.linkError": "Impossible d’ouvrir le lien."
  },
  "de": {
    "hf.intro": "Entdecke Modelle von Hugging Face und wähle die Dateien zum Herunterladen aus.",
    "hf.search": "Nach Modell oder Autor suchen",
    "hf.searchResults": "Suchergebnisse",
    "hf.emptySearch": "Keine Modelle für diese Suche gefunden.",
    "hf.selectedCount": "{count} ausgewählt",
    "hf.selectedSize": "{count} ausgewählt · {size}",
    "hf.downloadSelected": "Auswahl herunterladen",
    "hf.description": "Offizielle Beschreibung",
    "hf.repository": "Repository im Browser öffnen",
    "hf.batchProgress": "Download {index} von {count}…",
    "hf.batchFinished": "Download mit Problemen beendet. Ziel: {folder}.",
    "hf.itemDone": "Heruntergeladen",
    "hf.linkError": "Der Link konnte nicht geöffnet werden."
  }
};
for (const [language, entries] of Object.entries(hfDiscoveryTranslations)) Object.assign(translations[language], entries);

const hfTransferLabels = {
  "en": {
    "hf.downloadStoppedEmpty": "Download stopped. No files were completed.",
    "hf.stopDownload": "Stop download",
    "hf.stoppingDownload": "Stopping download…",
    "hf.downloadStopped": "Download stopped. Completed files remain in {folder}.",
    "hf.cancelDownloadError": "Could not stop the download."
  },
  "pt": {
    "hf.downloadStoppedEmpty": "Download interrompido. Nenhum arquivo foi concluído.",
    "hf.stopDownload": "Interromper download",
    "hf.stoppingDownload": "Interrompendo download…",
    "hf.downloadStopped": "Download interrompido. Os arquivos concluídos estão em {folder}.",
    "hf.cancelDownloadError": "Não foi possível interromper o download."
  },
  "es": {
    "hf.downloadStoppedEmpty": "Descarga detenida. No se completó ningún archivo.",
    "hf.stopDownload": "Detener descarga",
    "hf.stoppingDownload": "Deteniendo la descarga…",
    "hf.downloadStopped": "Descarga detenida. Los archivos completos están en {folder}.",
    "hf.cancelDownloadError": "No se pudo detener la descarga."
  },
  "fr": {
    "hf.downloadStoppedEmpty": "Téléchargement arrêté. Aucun fichier n’a été terminé.",
    "hf.stopDownload": "Arrêter le téléchargement",
    "hf.stoppingDownload": "Arrêt du téléchargement…",
    "hf.downloadStopped": "Téléchargement arrêté. Les fichiers terminés sont dans {folder}.",
    "hf.cancelDownloadError": "Impossible d’arrêter le téléchargement."
  },
  "de": {
    "hf.downloadStoppedEmpty": "Download gestoppt. Keine Datei wurde vollständig heruntergeladen.",
    "hf.stopDownload": "Download stoppen",
    "hf.stoppingDownload": "Download wird gestoppt…",
    "hf.downloadStopped": "Download gestoppt. Fertige Dateien liegen in {folder}.",
    "hf.cancelDownloadError": "Der Download konnte nicht gestoppt werden."
  }
};
for (const [language, entries] of Object.entries(hfTransferLabels)) Object.assign(translations[language], entries);

const hfProgressLabels = {
  en: ['{size} downloaded', 'About {time} remaining', 'Estimating time remaining…'],
  pt: ['{size} baixados', 'Cerca de {time} restantes', 'Estimando tempo restante…'],
  es: ['{size} descargados', 'Quedan unos {time}', 'Estimando el tiempo restante…'],
  fr: ['{size} téléchargés', 'Environ {time} restantes', 'Estimation du temps restant…'],
  de: ['{size} heruntergeladen', 'Noch etwa {time}', 'Verbleibende Zeit wird geschätzt…'],
};
for (const [language, [downloaded, remaining, estimating]] of Object.entries(hfProgressLabels)) {
  Object.assign(translations[language], {
    'hf.bytesDownloaded': downloaded, 'hf.timeRemaining': remaining, 'hf.estimatingTime': estimating,
  });
}

const progressAndMetrics = {
  "en": {
    "hf.verifying": "Verifying the downloaded file…",
    "hf.finalizing": "Finalizing…",
    "composer.tokenRate": "{speed} tok/s",
    "composer.contextUsage": "Context {used}/{limit} ({percent}%)",
    "composer.contextTokens": "{used} context tokens"
  },
  "pt": {
    "hf.verifying": "Verificando o arquivo baixado…",
    "hf.finalizing": "Finalizando…",
    "composer.tokenRate": "{speed} tok/s",
    "composer.contextUsage": "Contexto {used}/{limit} ({percent}%)",
    "composer.contextTokens": "{used} tokens no contexto"
  },
  "es": {
    "hf.verifying": "Verificando el archivo descargado…",
    "hf.finalizing": "Finalizando…",
    "composer.tokenRate": "{speed} tok/s",
    "composer.contextUsage": "Contexto {used}/{limit} ({percent}%)",
    "composer.contextTokens": "{used} tokens de contexto"
  },
  "fr": {
    "hf.verifying": "Vérification du fichier téléchargé…",
    "hf.finalizing": "Finalisation…",
    "composer.tokenRate": "{speed} jetons/s",
    "composer.contextUsage": "Contexte {used}/{limit} ({percent} %)",
    "composer.contextTokens": "{used} jetons de contexte"
  },
  "de": {
    "hf.verifying": "Heruntergeladene Datei wird geprüft…",
    "hf.finalizing": "Wird abgeschlossen…",
    "composer.tokenRate": "{speed} Token/s",
    "composer.contextUsage": "Kontext {used}/{limit} ({percent} %)",
    "composer.contextTokens": "{used} Kontext-Token"
  }
};
for (const [language, entries] of Object.entries(progressAndMetrics)) Object.assign(translations[language], entries);

const hfPauseLabels = {
  "en": {
    "hf.transferResults": "Download results",
    "hf.pauseDownload": "Pause",
    "hf.resumeDownload": "Resume",
    "hf.pausingDownload": "Pausing download…",
    "hf.downloadPaused": "Download paused until {date}.",
    "hf.pauseExpired": "Download pause expired.",
    "hf.pauseError": "Could not pause the download.",
    "hf.pausedExists": "Resume or discard the paused download first.",
    "hf.discardedPause": "Paused download discarded.",
    "hf.resumeError": "Could not resume. The pause is valid until {date}."
  },
  "pt": {
    "hf.transferResults": "Resultados do download",
    "hf.pauseDownload": "Pausar",
    "hf.resumeDownload": "Retomar",
    "hf.pausingDownload": "Pausando download…",
    "hf.downloadPaused": "Download pausado até {date}.",
    "hf.pauseExpired": "O prazo da pausa expirou.",
    "hf.pauseError": "Não foi possível pausar o download.",
    "hf.pausedExists": "Retome ou descarte o download pausado primeiro.",
    "hf.discardedPause": "Download pausado descartado.",
    "hf.resumeError": "Não foi possível retomar. A pausa vale até {date}."
  },
  "es": {
    "hf.transferResults": "Resultados de la descarga",
    "hf.pauseDownload": "Pausar",
    "hf.resumeDownload": "Reanudar",
    "hf.pausingDownload": "Pausando la descarga…",
    "hf.downloadPaused": "Descarga pausada hasta {date}.",
    "hf.pauseExpired": "La pausa de la descarga caducó.",
    "hf.pauseError": "No se pudo pausar la descarga.",
    "hf.pausedExists": "Reanuda o descarta primero la descarga pausada.",
    "hf.discardedPause": "Descarga pausada descartada.",
    "hf.resumeError": "No se pudo reanudar. La pausa es válida hasta {date}."
  },
  "fr": {
    "hf.transferResults": "Résultats du téléchargement",
    "hf.pauseDownload": "Mettre en pause",
    "hf.resumeDownload": "Reprendre",
    "hf.pausingDownload": "Mise en pause du téléchargement…",
    "hf.downloadPaused": "Téléchargement en pause jusqu’au {date}.",
    "hf.pauseExpired": "La pause du téléchargement a expiré.",
    "hf.pauseError": "Impossible de mettre le téléchargement en pause.",
    "hf.pausedExists": "Reprenez ou supprimez d’abord le téléchargement en pause.",
    "hf.discardedPause": "Téléchargement en pause supprimé.",
    "hf.resumeError": "Impossible de reprendre. La pause reste valable jusqu’au {date}."
  },
  "de": {
    "hf.transferResults": "Download-Ergebnisse",
    "hf.pauseDownload": "Pausieren",
    "hf.resumeDownload": "Fortsetzen",
    "hf.pausingDownload": "Download wird pausiert…",
    "hf.downloadPaused": "Download bis {date} pausiert.",
    "hf.pauseExpired": "Die Downloadpause ist abgelaufen.",
    "hf.pauseError": "Der Download konnte nicht pausiert werden.",
    "hf.pausedExists": "Setze den pausierten Download zuerst fort oder verwirf ihn.",
    "hf.discardedPause": "Pausierter Download verworfen.",
    "hf.resumeError": "Fortsetzen fehlgeschlagen. Die Pause gilt bis {date}."
  }
};
for (const [language, entries] of Object.entries(hfPauseLabels)) Object.assign(translations[language], entries);

const stableControlsLabels = {
  en: ['Show download panel', 'Hide download panel', 'Context —'],
  pt: ['Mostrar painel de download', 'Ocultar painel de download', 'Contexto —'],
  es: ['Mostrar panel de descarga', 'Ocultar panel de descarga', 'Contexto —'],
  fr: ['Afficher le panneau de téléchargement', 'Masquer le panneau de téléchargement', 'Contexte —'],
  de: ['Downloadfenster anzeigen', 'Downloadfenster ausblenden', 'Kontext —'],
};
for (const [language, [show, hide, context]] of Object.entries(stableControlsLabels)) {
  Object.assign(translations[language], {
    'hf.showTransfer': show, 'hf.hideTransfer': hide, 'composer.contextPending': context,
  });
}

const jumpLatestLabels = {
  en: 'Jump to latest message',
  pt: 'Ir para a última mensagem',
  es: 'Ir al último mensaje',
  fr: 'Aller au dernier message',
  de: 'Zur letzten Nachricht springen',
};
for (const [language, label] of Object.entries(jumpLatestLabels)) translations[language]['chat.jumpLatest'] = label;

const skipVerificationLabels = {
  en: 'Skip verification', pt: 'Pular verificação', es: 'Omitir verificación',
  fr: 'Ignorer la vérification', de: 'Prüfung überspringen',
};
for (const [language, label] of Object.entries(skipVerificationLabels)) {
  translations[language]['hf.skipVerification'] = label;
}

const chatControlsLabels = {
  en: ['Attach files', 'External server online. This control only operates the integrated server.', 'Install the integrated backend in llama.cpp.', 'Select an available GGUF model in llama.cpp.', 'Server connection status'],
  pt: ['Anexar arquivos', 'Servidor externo online. Este botão só controla o servidor integrado.', 'Instale o backend integrado em llama.cpp.', 'Selecione um modelo GGUF disponível em llama.cpp.', 'Estado da conexão com o servidor'],
  es: ['Adjuntar archivos', 'Servidor externo en línea. Este botón solo controla el servidor integrado.', 'Instala el backend integrado en llama.cpp.', 'Selecciona un modelo GGUF disponible en llama.cpp.', 'Estado de la conexión con el servidor'],
  fr: ['Joindre des fichiers', 'Serveur externe en ligne. Ce bouton contrôle uniquement le serveur intégré.', 'Installez le backend intégré dans llama.cpp.', 'Sélectionnez un modèle GGUF disponible dans llama.cpp.', 'État de la connexion au serveur'],
  de: ['Dateien anhängen', 'Externer Server online. Diese Schaltfläche steuert nur den integrierten Server.', 'Installiere das integrierte Backend unter llama.cpp.', 'Wähle unter llama.cpp ein verfügbares GGUF-Modell aus.', 'Status der Serververbindung'],
};
for (const [language, [attach, external, install, model, status]] of Object.entries(chatControlsLabels)) {
  Object.assign(translations[language], {
    'composer.attachFiles': attach, 'status.externalReadOnly': external,
    'status.installIntegrated': install, 'status.chooseIntegratedModel': model, 'status.readOnly': status,
  });
}

const historyLabels = {
  "en": {
    "history.title": "History",
    "history.untitled": "Untitled conversation",
    "history.rename": "Rename",
    "history.pin": "Pin to top",
    "history.unpin": "Unpin",
    "history.delete": "Delete permanently",
    "history.confirmDelete": "Permanently delete “{title}” and its files?",
    "history.confirmSwitch": "End the active response or Live session and switch conversations?",
    "history.desktopOnly": "Persistent history is available in the desktop app.",
    "history.empty": "No saved conversations yet.",
    "history.failed": "Could not access conversation history.",
    "history.mediaExpired": "Expired attachment: {name}",
    "history.speechExpired": "Generated audio expired."
  },
  "pt": {
    "history.title": "Histórico",
    "history.untitled": "Conversa sem título",
    "history.rename": "Renomear",
    "history.pin": "Fixar no topo",
    "history.unpin": "Desafixar",
    "history.delete": "Excluir permanentemente",
    "history.confirmDelete": "Excluir permanentemente “{title}” e seus arquivos?",
    "history.confirmSwitch": "Encerrar a resposta ou sessão Live ativa e trocar de conversa?",
    "history.desktopOnly": "O histórico persistente está disponível no aplicativo para desktop.",
    "history.empty": "Ainda não há conversas salvas.",
    "history.failed": "Não foi possível acessar o histórico de conversas.",
    "history.mediaExpired": "Anexo expirado: {name}",
    "history.speechExpired": "O áudio gerado expirou."
  },
  "es": {
    "history.title": "Historial",
    "history.untitled": "Conversación sin título",
    "history.rename": "Renombrar",
    "history.pin": "Fijar arriba",
    "history.unpin": "Desfijar",
    "history.delete": "Eliminar permanentemente",
    "history.confirmDelete": "¿Eliminar permanentemente «{title}» y sus archivos?",
    "history.confirmSwitch": "¿Terminar la respuesta o sesión en vivo activa y cambiar de conversación?",
    "history.desktopOnly": "El historial persistente está disponible en la aplicación de escritorio.",
    "history.empty": "Aún no hay conversaciones guardadas.",
    "history.failed": "No se pudo acceder al historial de conversaciones.",
    "history.mediaExpired": "Adjunto caducado: {name}",
    "history.speechExpired": "El audio generado ha caducado."
  },
  "fr": {
    "history.title": "Historique",
    "history.untitled": "Conversation sans titre",
    "history.rename": "Renommer",
    "history.pin": "Épingler en haut",
    "history.unpin": "Désépingler",
    "history.delete": "Supprimer définitivement",
    "history.confirmDelete": "Supprimer définitivement « {title} » et ses fichiers ?",
    "history.confirmSwitch": "Terminer la réponse ou la session en direct et changer de conversation ?",
    "history.desktopOnly": "L’historique persistant est disponible dans l’application de bureau.",
    "history.empty": "Aucune conversation enregistrée pour le moment.",
    "history.failed": "Impossible d’accéder à l’historique des conversations.",
    "history.mediaExpired": "Pièce jointe expirée : {name}",
    "history.speechExpired": "L’audio généré a expiré."
  },
  "de": {
    "history.title": "Verlauf",
    "history.untitled": "Unbenannte Unterhaltung",
    "history.rename": "Umbenennen",
    "history.pin": "Oben anheften",
    "history.unpin": "Loslösen",
    "history.delete": "Endgültig löschen",
    "history.confirmDelete": "„{title}“ und die zugehörigen Dateien endgültig löschen?",
    "history.confirmSwitch": "Laufende Antwort oder Livesitzung beenden und Unterhaltung wechseln?",
    "history.desktopOnly": "Der dauerhafte Verlauf ist in der Desktop-App verfügbar.",
    "history.empty": "Noch keine gespeicherten Unterhaltungen.",
    "history.failed": "Auf den Unterhaltungsverlauf konnte nicht zugegriffen werden.",
    "history.mediaExpired": "Abgelaufener Anhang: {name}",
    "history.speechExpired": "Die erzeugte Audiodatei ist abgelaufen."
  }
};
for (const [language, entries] of Object.entries(historyLabels)) Object.assign(translations[language], entries);

const persistenceLabels = {
  en: ["Could not save this conversation. Try switching again to retry.", "Could not save settings. Select Save to try again.", "Could not load desktop settings."],
  pt: ["Não foi possível salvar esta conversa. Tente trocar de conversa novamente.", "Não foi possível salvar as configurações. Clique em Salvar para tentar novamente.", "Não foi possível carregar as configurações do aplicativo."],
  es: ["No se pudo guardar esta conversación. Intenta cambiar de conversación de nuevo.", "No se pudieron guardar los ajustes. Selecciona Guardar para reintentar.", "No se pudieron cargar los ajustes de la aplicación."],
  fr: ["Impossible d’enregistrer cette conversation. Réessayez de changer de conversation.", "Impossible d’enregistrer les paramètres. Sélectionnez Enregistrer pour réessayer.", "Impossible de charger les paramètres de l’application."],
  de: ["Die Unterhaltung konnte nicht gespeichert werden. Versuche erneut, die Unterhaltung zu wechseln.", "Die Einstellungen konnten nicht gespeichert werden. Wähle Speichern, um es erneut zu versuchen.", "Die App-Einstellungen konnten nicht geladen werden."],
};
for (const [language, [retry, saveFailed, loadFailed]] of Object.entries(persistenceLabels)) {
  Object.assign(translations[language], {
    'history.retrySave': retry,
    'settings.saveFailed': saveFailed,
    'settings.loadFailed': loadFailed,
  });
}

for (const [language, label] of Object.entries({
  en: 'Use bundled LFM3-Omni',
  pt: 'Usar LFM3-Omni incluído',
  es: 'Usar LFM3-Omni incluido',
  fr: 'Utiliser LFM3-Omni inclus',
  de: 'Mitgeliefertes LFM3-Omni verwenden',
})) {
  translations[language]['backend.useBundledModel'] = label;
}

const catalogSortLabels = {
  en: ['Sort by', 'Trending', 'Most downloaded', 'Most liked', 'Newest', 'Recently updated', 'Name (A–Z)'],
  pt: ['Ordenar por', 'Em alta', 'Mais baixados', 'Mais curtidos', 'Mais novos', 'Atualizados recentemente', 'Nome (A–Z)'],
  es: ['Ordenar por', 'En tendencia', 'Más descargados', 'Más populares', 'Más recientes', 'Actualizados recientemente', 'Nombre (A–Z)'],
  fr: ['Trier par', 'Tendances', 'Les plus téléchargés', 'Les plus aimés', 'Les plus récents', 'Mis à jour récemment', 'Nom (A–Z)'],
  de: ['Sortieren nach', 'Im Trend', 'Meistgeladen', 'Meiste Likes', 'Neueste', 'Kürzlich aktualisiert', 'Name (A–Z)'],
};
const catalogSortKeys = ['sort', 'sortTrending', 'sortDownloads', 'sortLikes', 'sortCreated', 'sortUpdated', 'sortName'];
for (const [language, labels] of Object.entries(catalogSortLabels)) {
  catalogSortKeys.forEach((key, index) => { translations[language][`hf.${key}`] = labels[index]; });
}

const gatedDownloadLabels = {
  en: 'Downloading these files requires access on Hugging Face. Open the repository to sign in and request access.',
  pt: 'Para baixar esses arquivos, abra o repositório no Hugging Face, entre na sua conta e solicite acesso.',
  es: 'Para descargar estos archivos, abre el repositorio en Hugging Face, inicia sesión y solicita acceso.',
  fr: 'Pour télécharger ces fichiers, ouvrez le dépôt sur Hugging Face, connectez-vous et demandez l’accès.',
  de: 'Öffne das Repository auf Hugging Face, melde dich an und beantrage Zugriff auf diese Dateien.',
};
for (const [language, label] of Object.entries(gatedDownloadLabels)) {
  translations[language]['hf.gated'] = label;
}

const weightLabels = {
  en: ['Weight format', '{count}-bit', 'Model type', 'Complete checkpoint', 'Separate components', 'Diffusion weights', 'Text encoder', 'VAE', 'Custom noise schedule (sigmas)', 'Use comma-separated numbers ending in 0. The number of values minus one sets the step count.'],
  pt: ['Formato dos pesos', '{count} bits', 'Tipo de modelo', 'Checkpoint completo', 'Componentes separados', 'Pesos de difusão', 'Codificador de texto', 'VAE', 'Sequência de ruído (sigmas)', 'Separe os números por vírgulas e termine com 0. A quantidade de valores menos um define as etapas.'],
  es: ['Formato de pesos', '{count} bits', 'Tipo de modelo', 'Checkpoint completo', 'Componentes separados', 'Pesos de difusión', 'Codificador de texto', 'VAE', 'Secuencia de ruido (sigmas)', 'Separa los números con comas y termina con 0. El número de valores menos uno define los pasos.'],
  fr: ['Format des poids', '{count} bits', 'Type de modèle', 'Checkpoint complet', 'Composants séparés', 'Poids de diffusion', 'Encodeur de texte', 'VAE', 'Séquence de bruit (sigmas)', 'Séparez les nombres par des virgules et terminez par 0. Le nombre de valeurs moins un définit les étapes.'],
  de: ['Gewichtsformat', '{count} Bit', 'Modelltyp', 'Vollständiger Checkpoint', 'Separate Komponenten', 'Diffusionsgewichte', 'Textencoder', 'VAE', 'Rauschfolge (Sigmas)', 'Trenne die Zahlen durch Kommas und ende mit 0. Die Anzahl der Werte minus eins bestimmt die Schritte.'],
};
const weightKeys = ['hf.format', 'hf.bits', 'image.modelType', 'image.checkpoint', 'image.components',
  'image.diffusion', 'image.encoder', 'image.vae', 'image.sigmas', 'image.sigmasHint'];
for (const [language, labels] of Object.entries(weightLabels)) {
  weightKeys.forEach((key, index) => { translations[language][key] = labels[index]; });
}

const missingImageComponents = {
  en: 'Select the remaining model components in Settings → stable-diffusion.cpp.',
  pt: 'Selecione os componentes restantes em Configurações → stable-diffusion.cpp.',
  es: 'Selecciona los componentes restantes en Ajustes → stable-diffusion.cpp.',
  fr: 'Sélectionnez les composants restants dans Paramètres → stable-diffusion.cpp.',
  de: 'Wähle die übrigen Modellkomponenten unter Einstellungen → stable-diffusion.cpp.',
};
for (const [language, label] of Object.entries(missingImageComponents)) {
  translations[language]['image.componentsMissing'] = label;
}

const imageKeys = [
  'tab', 'title', 'prompt', 'width', 'height', 'generate', 'generating', 'cancelling', 'steps',
  'preview', 'export', 'settings', 'device', 'choose', 'install', 'installing', 'stop',
  'ready', 'stopped', 'loading', 'modelMissing', 'runtimeMissing', 'desktop', 'failed', 'memory',
  'stepCount', 'advanced', 'negative', 'seed', 'random', 'sampler', 'empty',
];
const imageLabels = {
  en: [
    'Image', 'Generate an image', 'Describe the image', 'Width', 'Height', 'Generate', 'Generating…',
    'Cancelling…', 'Step {completed} of {total}', 'Generated image', 'Save PNG', 'stable-diffusion.cpp',
    'Compute device', 'Select checkpoint', 'Install backend', 'Installing backend…', 'Stop backend',
    'Model loaded', 'Backend stopped', 'Loading image model…', 'Select a local checkpoint in Settings → stable-diffusion.cpp.',
    'Install the backend in Settings → stable-diffusion.cpp.', 'Image generation is available in the desktop app.',
    'Image operation failed.', 'Try CPU or free memory and retry.',
    'Steps', 'Advanced', 'Negative prompt', 'Seed', 'Random', 'Sampler', 'Generated images will appear here.',
  ],
  pt: [
    'Imagem', 'Gerar imagem', 'Descreva a imagem', 'Largura', 'Altura', 'Gerar', 'Gerando…',
    'Cancelando…', 'Etapa {completed} de {total}', 'Imagem gerada', 'Salvar PNG', 'stable-diffusion.cpp',
    'Dispositivo de processamento', 'Selecionar checkpoint', 'Instalar backend', 'Instalando backend…', 'Parar backend',
    'Modelo carregado', 'Backend parado', 'Carregando modelo de imagem…', 'Selecione um checkpoint local em Configurações → stable-diffusion.cpp.',
    'Instale o backend em Configurações → stable-diffusion.cpp.', 'A geração de imagens está disponível no app para desktop.',
    'A operação de imagem falhou.', 'Tente usar a CPU ou liberar memória antes de tentar de novo.',
    'Etapas', 'Avançado', 'Prompt negativo', 'Seed', 'Aleatória', 'Sampler', 'A imagem gerada aparecerá aqui.',
  ],
  es: [
    'Imagen', 'Generar una imagen', 'Describe la imagen', 'Ancho', 'Alto', 'Generar', 'Generando…',
    'Cancelando…', 'Paso {completed} de {total}', 'Imagen generada', 'Guardar PNG', 'stable-diffusion.cpp',
    'Dispositivo de cálculo', 'Seleccionar checkpoint', 'Instalar backend', 'Instalando backend…', 'Detener backend',
    'Modelo cargado', 'Backend detenido', 'Cargando modelo de imagen…', 'Selecciona un checkpoint local en Ajustes → stable-diffusion.cpp.',
    'Instala el backend en Ajustes → stable-diffusion.cpp.', 'La generación de imágenes está disponible en la aplicación de escritorio.',
    'Falló la operación de imagen.', 'Prueba con la CPU o libera memoria y vuelve a intentarlo.',
    'Pasos', 'Avanzado', 'Prompt negativo', 'Semilla', 'Aleatoria', 'Muestreador', 'La imagen generada aparecerá aquí.',
  ],
  fr: [
    'Image', 'Générer une image', 'Décrivez l’image', 'Largeur', 'Hauteur', 'Générer', 'Génération…',
    'Annulation…', 'Étape {completed} sur {total}', 'Image générée', 'Enregistrer le PNG', 'stable-diffusion.cpp',
    'Périphérique de calcul', 'Choisir un checkpoint', 'Installer le moteur', 'Installation du moteur…', 'Arrêter le moteur',
    'Modèle chargé', 'Moteur arrêté', 'Chargement du modèle d’image…', 'Choisissez un checkpoint local dans Paramètres → stable-diffusion.cpp.',
    'Installez le moteur dans Paramètres → stable-diffusion.cpp.', 'La génération d’images est disponible dans l’application de bureau.',
    'L’opération sur l’image a échoué.', 'Essayez le processeur ou libérez de la mémoire avant de réessayer.',
    'Étapes', 'Avancé', 'Prompt négatif', 'Graine', 'Aléatoire', 'Échantillonneur', 'L’image générée apparaîtra ici.',
  ],
  de: [
    'Bild', 'Bild erzeugen', 'Beschreibe das Bild', 'Breite', 'Höhe', 'Erzeugen', 'Wird erzeugt…',
    'Wird abgebrochen…', 'Schritt {completed} von {total}', 'Erzeugtes Bild', 'PNG speichern', 'stable-diffusion.cpp',
    'Rechengerät', 'Checkpoint auswählen', 'Backend installieren', 'Backend wird installiert…', 'Backend stoppen',
    'Modell geladen', 'Backend gestoppt', 'Bildmodell wird geladen…', 'Wähle unter Einstellungen → stable-diffusion.cpp einen lokalen Checkpoint.',
    'Installiere das Backend unter Einstellungen → stable-diffusion.cpp.', 'Die Bilderzeugung ist in der Desktop-App verfügbar.',
    'Bildvorgang fehlgeschlagen.', 'Versuche es mit der CPU oder gib Speicher frei und versuche es erneut.',
    'Schritte', 'Erweitert', 'Negativer Prompt', 'Seed', 'Zufällig', 'Sampler', 'Das erzeugte Bild erscheint hier.',
  ],
};
for (const [language, labels] of Object.entries(imageLabels)) {
  imageKeys.forEach((key, index) => { translations[language][`image.${key}`] = labels[index]; });
}

const imageGuardLabels = {
  en: [
    'Loading requires {required} MiB of {resource}. {available} MiB available.',
    'Generation requires {required} MiB of {resource}. {available} MiB available.',
    'The GPU memory budget is unavailable. Select CPU in stable-diffusion.cpp settings.',
    'Install the image runtime with memory protection in stable-diffusion.cpp settings.',
    'This runtime accepts up to {width} × {height} pixels.',
  ],
  pt: [
    'O carregamento precisa de {required} MiB de {resource}. Há {available} MiB disponíveis.',
    'A geração precisa de {required} MiB de {resource}. Há {available} MiB disponíveis.',
    'Não foi possível consultar o orçamento de memória da GPU. Selecione CPU nas configurações do stable-diffusion.cpp.',
    'Instale o runtime de imagem com proteção de memória nas configurações do stable-diffusion.cpp.',
    'Este runtime aceita até {width} × {height} pixels.',
  ],
  es: [
    'La carga requiere {required} MiB de {resource}. Hay {available} MiB disponibles.',
    'La generación requiere {required} MiB de {resource}. Hay {available} MiB disponibles.',
    'No se pudo consultar el presupuesto de memoria de la GPU. Selecciona CPU en los ajustes de stable-diffusion.cpp.',
    'Instala el motor de imagen con protección de memoria en los ajustes de stable-diffusion.cpp.',
    'Este motor acepta hasta {width} × {height} píxeles.',
  ],
  fr: [
    'Le chargement nécessite {required} Mio de {resource}. {available} Mio sont disponibles.',
    'La génération nécessite {required} Mio de {resource}. {available} Mio sont disponibles.',
    'Le budget mémoire du GPU est indisponible. Sélectionnez le processeur dans les paramètres de stable-diffusion.cpp.',
    'Installez le moteur d’image avec protection mémoire dans les paramètres de stable-diffusion.cpp.',
    'Ce moteur accepte jusqu’à {width} × {height} pixels.',
  ],
  de: [
    'Zum Laden werden {required} MiB {resource} benötigt. {available} MiB sind verfügbar.',
    'Zum Erzeugen werden {required} MiB {resource} benötigt. {available} MiB sind verfügbar.',
    'Das GPU-Speicherbudget ist nicht verfügbar. Wähle CPU in den stable-diffusion.cpp-Einstellungen.',
    'Installiere die Bildlaufzeit mit Speicherschutz in den stable-diffusion.cpp-Einstellungen.',
    'Diese Laufzeit akzeptiert bis zu {width} × {height} Pixel.',
  ],
};
const imageGuardKeys = ['guard.load', 'guard.generation', 'guardGpuUnknown', 'guardRuntime', 'guardRange'];
for (const [language, labels] of Object.entries(imageGuardLabels)) {
  imageGuardKeys.forEach((key, index) => { translations[language][`image.${key}`] = labels[index]; });
}

export function setLocale(value) {
  locale = availableLocales.includes(value) ? value : 'en';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = ({ en: 'en', pt: 'pt-BR', es: 'es', fr: 'fr', de: 'de' })[locale];
    applyTranslations(document);
    window.dispatchEvent(new CustomEvent('omni-locale-change', { detail: { locale } }));
  }
  return locale;
}
export function t(key, vars = {}) {
  let value = translations[locale]?.[key] ?? en[key] ?? key;
  for (const [name, replacement] of Object.entries(vars)) value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}
function nodeVars(node) {
  const vars = {};
  for (const [key, value] of Object.entries(node.dataset)) {
    if (key.startsWith('i18nVar')) {
      const name = key.slice(7);
      vars[name[0].toLowerCase() + name.slice(1)] = value;
    }
  }
  return vars;
}
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n, nodeVars(node)); });
  root.querySelectorAll('[data-i18n-title]').forEach((node) => { node.title = t(node.dataset.i18nTitle, nodeVars(node)); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => { node.placeholder = t(node.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-i18n-aria]').forEach((node) => { node.setAttribute('aria-label', t(node.dataset.i18nAria)); });
}
