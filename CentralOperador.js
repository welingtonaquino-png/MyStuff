// ==UserScript==
// @name         Central do Operador - Griscargo
// @namespace    griscargo.monitoramento.operador
// @version      26.0
// @description  Console do operador de monitoramento: tratamento de ocorrencias passo a passo, acionamento policial, informativos, varredura de sensores, punicoes, comandos em massa e regras de frota. Instala-se sozinho com o Grid Padrao aberto.
// @author       Welington
// @match        https://gerenciamento.griscargo.com.br/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

/* =====================================================================
   CENTRAL DO OPERADOR - Griscargo
   v25.0  (menu > Novidades traz o historico completo de versoes)

   Userscript do Tampermonkey. Instala-se sozinho quando o Grid Padrao
   esta aberto e se remove ao sair dele. Todas as ferramentas ficam no
   console flutuante no canto inferior direito.

   ---------------------------------------------------------------
   PLACA SELECIONADA (exigem uma placa marcada no grid)
   ---------------------------------------------------------------
   - Ligar: disca por SIP para o condutor. Telefone lido do cadastro,
     celular tem prioridade; aceita numero formatado e com 0 antes do
     DDD. Botao direito copia o numero.
   - Tratar Ocorrencias: fluxo passo a passo (SIM/NAO) ate o reagendar,
     com o plano de passos de cada ocorrencia. Cada tipo de passo tem
     sua tela: contato, WhatsApp, acionamento policial, formalizar e
     visualizacao no mapa (com print para a area de transferencia).
     . Baixar sem tratativa: marca todos os passos como NAO, sem
       anotacao, para alerta falso ou dispensado.
     . Repetir tratativa: repete a resposta ja dada no mesmo passo de
       outra ocorrencia da placa, sem refazer a anotacao.
     . Ao terminar, fecha sozinho e atualiza o grid.
   - Criar Informativo: monta e copia o informativo, com negrito do
     WhatsApp nas informacoes principais.
   - Tentativa de Contato / Informado via Grupo: anotacoes rapidas.
   - Fazer Acionamento: ficha do veiculo + postos policiais proximos
     (Brasil ou pais vizinho conforme a coordenada). Registrado o
     acionamento, o passo e dado sozinho: SIM se houve contato.

   ---------------------------------------------------------------
   SENSORES
   ---------------------------------------------------------------
   - Alertas da placa: historico de alertas do veiculo selecionado.
   - Varredura: percorre as placas com alerta e classifica o sensor
     como defeito, intermitente ou normal pelo tempo de alarme.
     . Nao e defeito: marca falso positivo por 30 dias.
     . Marcar defeito: forca as opcoes quando a conferencia manual na
       tecnologia confirma o defeito.
     . Liberar 7d: autoriza o sensor, envia o comando de desabilitar
       (quando a tecnologia tem) e anota na placa.
     . Informativo: texto pronto para o grupo e o analista.

   ---------------------------------------------------------------
   BASE
   ---------------------------------------------------------------
   - Punicoes: relatorio de velocidade por frota (Rossini 11-29 picos,
     Belluno 6-29), PDF detalhado para o cliente e cadastro em lote.
     . Aguardando punicao: cruza cada placa com velocidade, 3 ultimas
       posicoes, coordenada, area liberada/alvo, origem e destino da
       viagem e autorizacoes vigentes (Trafegar, Descarga/Reinicio
       Noturno, Rastreado por outra GR). Avisa quando ha alvo a menos
       de 5 km. Permite iniciar, cancelar (recadastrando), concluir e
       gerar o informativo com link do Google Maps.
     . Falta de macro: Colli (FIM DE JORNADA) e Falleiro (PERNOITE)
       dentro da janela de pernoite de cada uma, consultando o
       historico de macros.
     . Colar da frota: le o aviso da transportadora e cadastra as
       punicoes de direcao ininterrupta de uma vez.
   - Comandos em massa: reset/desbloqueio (so das 04h as 07h) e
     solicitar posicao, em lotes de 10 com pausa entre eles.
   - Liberacao em massa: autorizacao temporaria por frota.
   - Velocidade em massa: reagenda de uma vez as ocorrencias de
     Velocidade e Estado Desativado ja prontas para reagendar.
   - Regras da frota: consulta rapida do manual das 22 frotas.
   - Novidades: historico de versoes.

   ---------------------------------------------------------------
   EM SEGUNDO PLANO
   ---------------------------------------------------------------
   - Barra a janela "Integracoes / Alertas Criticos" antes de abrir.
   - Mantem o "Atualizar OBS no Grid" desmarcado.
   - Regras de pernoite por frota aplicadas a ligacoes, mensagens e
     anotacoes.
   - Registro automatico "acionado via WhatsApp" ao escolher mensagem.

   ---------------------------------------------------------------
   OBSERVACOES
   ---------------------------------------------------------------
   - A data manual de reagendamento e o envio de comandos fora da
     janela da madrugada sao restritos (USUARIOS_SEM_RESTRICAO).
   - No console do navegador: centralRemover() desinstala,
     centralLigar() reinstala.
   - Tabelas de configuracao no inicio do arquivo: REGRAS_FROTAS,
     PUNICOES_CFG, PUNICAO_INICIO, CMD_MASSA, CMD_SENSOR,
     CMD_LIBERAR_PUNICAO, SENSORES_VARREDURA, MACRO_PUNICAO.
===================================================================== */
function centralInstalar() {
	'use strict';

	const T = window.top;
	const D = T.document;

	/* ========================= CONFIGURACAO ========================= */
	const ID_BOTAO            = 'btn-acionamento-ficha';
	const ID_BOTAO_LIGAR_FIXO = 'btn-ligar-flutuante-fixo';
	const ID_BOTAO_INFORMADO  = 'btn-informado-grupo';
	const ID_BOTAO_CONTATO    = 'btn-tentativa-contato';
	const ID_BOTAO_INFORMATIVO = 'btn-criar-informativo';
	const ID_BOTAO_TRATAR      = 'btn-tratar-ocorrencias';
	const ID_BOTAO_MENU        = 'btn-menu-acoes';
	const ID_BOTAO_SENSORES    = 'btn-alertas-sensores';
	const ID_BOTAO_VARREDURA   = 'btn-varredura-sensores';
	const ID_BOTAO_REGRAS      = 'btn-regras-frota';
	const ID_BOTAO_PUNICOES    = 'btn-punicoes';
	const ID_BOTAO_DESBLOQ     = 'btn-desbloqueio-massa';
	const ID_BOTAO_LIBERACAO   = 'btn-liberacao-massa';
	const ID_BOTAO_VELOCIDADE  = 'btn-velocidade-massa';
	// o bot\u00E3o trata Velocidade e Estado Desativado (mesmo fluxo de reagendamento)
	const RE_VELOCIDADE        = /VELOCIDADE|ESTADO\s+DESATIVADO/i;

	/* ===== LIBERA\u00C7\u00C3O EM MASSA =====
	   Autoriza\u00E7\u00E3o tempor\u00E1ria por frota (Rossini: desengate at\u00E9 as 18h).
	   In\u00EDcio = agora; fim = hoje no hor\u00E1rio configurado.                        */
	const LIBERACAO_CFG = [
		{ nome: 'ROSSINI', re: /ROSSINI/i, cdTipo: '2', tipoRotulo: 'Desengate',
		  autorizou: 'THIAGO ROSSINI', motivo: 'Autorizado at\u00E9 as 18h', fimHora: 18, fimMin: 0,
		  // comando enviado junto da libera\u00E7\u00E3o (mesmo r\u00F3tulo para as tecnologias conhecidas)
		  comando: { cd: '7', label: '6-7-Autoriza Desengate' } }   // OMNILINK
	];

	/* ===== DESBLOQUEIO EM MASSA =====
	   Placas com observa\u00E7\u00E3o recente contendo "PUNI\u00C7\u00C3O" ficam de fora.       */
	// O comando muda conforme a tecnologia \u2014 c\u00F3digo E r\u00F3tulo.
	// Tecnologia sem comando cadastrado N\u00C3O recebe nada (evita disparar o comando errado).
	/* ===== COMANDOS EM MASSA =====
	   'desbloq' altera o estado do ve\u00EDculo: respeita puni\u00E7\u00E3o e a janela da
	   madrugada. 'posicao' apenas consulta: liberado a qualquer hora e para
	   qualquer placa. porTecnologia vazio = mesmo c\u00F3digo para todas.        */
	const CMD_MASSA = {
		desbloq: {
			nome: 'Reset de alarmes e desbloqueio',
			restrito: true,
			porTecnologia: {
				'SIGHRA':   { cd: '94', label: '41-94-Reset Alarmes e Desbloqueio (Mantendo Perfil)' },
				'ONIX':     { cd: '3',  label: '3-3-Desbloquear Ve\u00EDculo/Desligar Bloqueio' },
				'SASCAR':   { cd: '3',  label: '3-3-Desbloquear Ve\u00EDculo' },
				'OMNILINK': { cd: '3',  label: '3-3-Desbloquear Ve\u00EDculo' }
			}
		},
		posicao: {
			nome: 'Solicitar posi\u00E7\u00E3o',
			restrito: false,
			// mesmo c\u00F3digo (1) em todas, mas o r\u00F3tulo muda: SIGHRA diz "Requisi\u00E7\u00E3o"
			porTecnologia: {
				'ONIX':     { cd: '1', label: '1-1-Solicitar Posi\u00E7\u00E3o' },
				'OMNILINK': { cd: '1', label: '1-1-Solicitar Posi\u00E7\u00E3o' },
				'SASCAR':   { cd: '1', label: '1-1-Solicitar Posi\u00E7\u00E3o' },
				'SIGHRA':   { cd: '1', label: '1-1-Requisi\u00E7\u00E3o de Posi\u00E7\u00E3o' }
			},
			padrao: { cd: '1', label: '1-1-Solicitar Posi\u00E7\u00E3o' }   // tecnologia nova: r\u00F3tulo mais comum
		}
	};
	/* O grid escreve a tecnologia de formas diferentes (ONIX, ONIXSAT, ONIX SAT).
	   Casamos pelo in\u00EDcio do nome para n\u00E3o perder o comando por causa disso.
	   Vale para TODAS as tabelas de comando.                                  */
	function normalizarTecnologia(tec) {
		const t = String(tec || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
			.toUpperCase().replace(/[^A-Z]/g, '');
		if (!t) return '';
		const conhecidas = ['ONIX', 'SASCAR', 'SIGHRA', 'OMNILINK', 'AUTOTRAC'];
		return conhecidas.find(c => t.indexOf(c) === 0 || c.indexOf(t) === 0) || t;
	}

	function comandoDaTecnologia(tec, modo) {
		const c = CMD_MASSA[modo || 'desbloq'];
		if (!c) return null;
		const t = normalizarTecnologia(tec);
		return (c.porTecnologia && c.porTecnologia[t]) || c.padrao || null;
	}
	// a fun\u00E7\u00E3o s\u00F3 opera na janela da madrugada, para evitar uso indevido
	const DESBLOQ_JANELA    = { ini: 4, fim: 7 };
	const DESBLOQ_LOTE      = 10;   // ve\u00EDculos por request: lotes menores n\u00E3o travam o servidor
	const DESBLOQ_PAUSA_MS  = 400;  // respiro entre um request e o pr\u00F3ximo
	const DESBLOQ_COLUNAS   = '111111111111011011111111100000010001000000000000000000';

	/* ===== PUNI\u00C7\u00D5ES POR EXCESSO DE VELOCIDADE =====
	   Relat\u00F3rio do dia anterior por transportadora. punir=false gera apenas o
	   relat\u00F3rio (sem cadastro de puni\u00E7\u00E3o). cd_tempo = horas de puni\u00E7\u00E3o.        */
	const PUNICOES_CFG = [
		{ nome: 'ROSSINI', cdClifor: '2',  velocidade: '100', cdTipo: '2', minPicos: 11, maxPicos: 29, horas: 4, punir: true },
		{ nome: 'BELLUNO', cdClifor: '94', velocidade: '95',  cdTipo: '0', minPicos: 6,  maxPicos: 29, horas: 2, punir: true },
		{ nome: 'FRIBON',  cdClifor: '57', velocidade: '90',  cdTipo: '0', punir: false }
	];
	// cd_tipo do relat\u00F3rio DETALHADO (data, motorista, placa, velocidade, lat/lon):
	// \u00E9 este que vira PDF para o cliente. A contagem de picos segue no cd_tipo de cada frota.
	const CD_TIPO_DETALHADO = '1';

	/* ===== PUNI\u00C7\u00C3O POR FALTA DE MACRO =====
	   Frotas que exigem macro de encerramento antes do pernoite. O script apenas
	   REGISTRA A ANOTA\u00C7\u00C3O \u2014 o bloqueio do ve\u00EDculo continua sendo manual.        */
	const MACRO_PUNICAO = [
		{ re: /COLLI/i,    nome: 'COLLI BIKE',    macroRe: /FIM\s*DE\s*JORNADA/i, macroRotulo: 'FIM DE JORNADA',
		  limiteHora: 22, desbloqueioHora: 9,
		  anotacao: '**EM PUNI\u00C7\u00C3O** N\u00C3O DESBLOQUEAR ANTES DAS 09HRS' },
		{ re: /FALLEIRO/i, nome: 'TRANSFALLEIRO', macroRe: /PERNOITE/i,            macroRotulo: 'PERNOITE',
		  limiteHora: 23, desbloqueioHora: 10,
		  anotacao: '**EM PUNI\u00C7\u00C3O** N\u00C3O DESBLOQUEAR ANTES DAS 10HRS' }
	];
	// macro de encerramento vale se enviada do meio-dia anterior at\u00E9 o limite da frota
	const MACRO_INICIO_HORA = 12;
	// macros que indicam ve\u00EDculo em cliente: n\u00E3o punir sem o operador conferir
	const RE_MACRO_CLIENTE = /CARGA|DESCARGA|CARREGA|DESCARREGA/i;
	/* Autoriza\u00E7\u00F5es que dispensam o envio de macro \u2014 punir por falta dela
	   seria punir o condutor por cumprir o que a frota autorizou.            */
	const RE_AUTORIZ_SEM_MACRO = /N[A\u00C3]O\s+USAR\s+MACRO|MOTORISTA\s+PX/i;
	const autorizDispensaMacro = t => RE_AUTORIZ_SEM_MACRO.test(
		String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
	const URL_MACROS_HIST = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/msgs/lista1.php';

	/* ===== IN\u00CDCIO DA PUNI\u00C7\u00C3O =====
	   A punição come\u00E7a no hor\u00E1rio em que o ve\u00EDculo voltaria a rodar (fim do
	   pernoite da frota) e dura as horas da frota. O bloqueio j\u00E1 vai com o
	   desbloqueio programado, ent\u00E3o o ve\u00EDculo se libera sozinho no fim.     */
	const PUNICAO_INICIO = [
		{ re: /ROSSINI/i, nome: 'ROSSINI TRANSPORTES', horas: 4, inicioHora: 5,
		  horasPorTipo: { ininterrupta: 11, velocidade: 4 },
		  comando: { cd: '107', label: '21-107-Lacrar Motor', comProprietario: true } },
		{ re: /BELLUNO/i, nome: 'BELLUNO LOGISTICA',   horas: 2, inicioHora: 5,
		  horasPorTipo: { velocidade: 2 },
		  comando: { cd: '2',   label: '2-2-Bloquear Ve\u00EDculo/Ligar Bloqueio', comProprietario: false } }
	];

	/* A dura\u00E7\u00E3o muda com o tipo (dire\u00E7\u00E3o ininterrupta costuma ser bem maior
	   que velocidade). O bloqueio precisa durar o mesmo tempo da puni\u00E7\u00E3o \u2014
	   um desbloqueio programado curto liberaria o ve\u00EDculo antes da hora.     */
	function horasDaPunicao(cfg, tipo) {
		const t = String(tipo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
		const porTipo = cfg.horasPorTipo || {};
		if (/ININTERRUPTA|DIRECAO/.test(t) && porTipo.ininterrupta) return porTipo.ininterrupta;
		if (/VELOCIDADE/.test(t) && porTipo.velocidade) return porTipo.velocidade;
		return cfg.horas;
	}
	const cfgPunicaoDoCliente = cli => PUNICAO_INICIO.find(c => c.re.test(String(cli || ''))) || null;

	/* Quem pode ser punido fora do hor\u00E1rio de pernoite:
	   - Belluno: qualquer tipo
	   - Rossini: s\u00F3 dire\u00E7\u00E3o ininterrupta (velocidade excedida come\u00E7a \u00E0s 05h)
	   Fora dessas combina\u00E7\u00F5es a puni\u00E7\u00E3o \u00E9 sempre agendada para o hor\u00E1rio de
	   rodagem, mesmo que o operador clique de dia.                            */
	function punivelForaDoPernoite(empresa, tipo) {
		const emp = String(empresa || '').toUpperCase();
		const tp = String(tipo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
		if (/BELLUNO/.test(emp)) return true;
		if (/ROSSINI/.test(emp)) return /ININTERRUPTA|DIRECAO/.test(tp);
		return false;
	}

	/* Ao cancelar a puni\u00E7\u00E3o o ve\u00EDculo precisa voltar a rodar. O comando muda
	   conforme a tecnologia \u2014 sem c\u00F3digo cadastrado, nada \u00E9 enviado (um c\u00F3digo
	   errado mexeria em outra coisa no caminh\u00E3o).                            */
	const CMD_LIBERAR_PUNICAO = {
		'ONIX':     { cd: '3',  label: '3-3-Desbloquear Ve\u00EDculo/Desligar Bloqueio' },
		'SASCAR':   { cd: '3',  label: '3-3-Desbloquear Ve\u00EDculo' },
		'SIGHRA':   { cd: '94', label: '41-94-Reset Alarmes e Desbloqueio (Mantendo Perfil)' },
		'OMNILINK': { cd: '28', label: '20-28-Deslacrar Motor' }   // par do 107-Lacrar Motor
	};
	const cmdLiberarPunicao = tec => CMD_LIBERAR_PUNICAO[normalizarTecnologia(tec)] || null;
	// casa a frota da supervis\u00E3o com a config do m\u00F3dulo de puni\u00E7\u00F5es
	const RE_FROTA_PUN = (cfg, empresa) =>
		new RegExp(cfg.nome.split(/\s+/)[0], 'i').test(String(empresa || ''));

	// hist\u00F3rico de macros: o condutor pode ter enviado a macro e depois outra
	async function buscarHistoricoMacros(cdVeiculo, dias) {
		const p2 = n => String(n).padStart(2, '0');
		const br = d => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
		const ate = new Date(), de = new Date(ate.getTime() - (dias || 3) * 24 * 3600000);
		const url = `${URL_MACROS_HIST}?nl=1&cd_veiculo=${encodeURIComponent(cdVeiculo)}` +
			`&dt_de=${br(de)}&dt_ate=${br(ate)}`;
		const html = await getTexto(url);
		const out = [];
		try {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			doc.querySelectorAll('#grid tr').forEach(tr => {
				const tds = tr.querySelectorAll('td');
				if (tds.length < 2) return;
				const quando = (tds[0].textContent || '').replace(/\s+/g, ' ').trim();
				const texto = (tds[1].textContent || '').replace(/\s+/g, ' ').trim();
				if (!/^\d{2}\/\d{2}\/\d{4}/.test(quando)) return;   // pula o cabe\u00E7alho
				const d = parseDataBR(quando);
				out.push({ quando: quando, ts: d ? d.getTime() : null, texto: texto });
			});
		} catch (e) { console.warn('[MACRO] hist\u00F3rico indispon\u00EDvel:', e); }
		return out;
	}

	// janela em que a macro de encerramento \u00E9 aceita: ontem 12h at\u00E9 o limite da frota
	function janelaMacroValida(cfg) {
		const agora = new Date();
		const fim = new Date(agora);
		fim.setHours(cfg.limiteHora || 23, 59, 59, 999);
		if (fim.getTime() > agora.getTime()) fim.setDate(fim.getDate() - 1);   // ainda n\u00E3o chegou hoje
		const ini = new Date(fim);
		ini.setDate(ini.getDate() - (fim.getDate() === agora.getDate() ? 1 : 0));
		ini.setHours(MACRO_INICIO_HORA, 0, 0, 0);
		return { ini: ini.getTime(), fim: fim.getTime() };
	}
	const cfgMacroDoCliente = cli => MACRO_PUNICAO.find(c => c.re.test(String(cli || ''))) || null;
	// aceita a macro enviada um pouco antes da janela (condutor que parou cedo)
	const MACRO_TOLERANCIA_H = 4;

	// janela de pernoite da frota, lida do HOR\u00C1RIO do manual (Colli 22h\u201305h, Falleiro 23h\u201305h)
	const janelaMacroFrota = cli => janelaPernoiteFrota(detectarFrota(cli));

	function dentroDaJanela(j, minAgora) {
		if (!j) return false;
		const d = new Date();
		const min = (typeof minAgora === 'number') ? minAgora : (d.getHours() * 60 + d.getMinutes());
		return (j.iniMin <= j.fimMin) ? (min >= j.iniMin && min < j.fimMin) : (min >= j.iniMin || min < j.fimMin);
	}

	// come\u00E7o da noite vigente: \u00FAltima vez que a janela abriu, menos a toler\u00E2ncia
	function inicioDaNoiteAtual(j) {
		const agora = new Date();
		const ini = new Date(agora);
		ini.setHours(Math.floor(j.iniMin / 60), j.iniMin % 60, 0, 0);
		if (ini.getTime() > agora.getTime()) ini.setDate(ini.getDate() - 1); // j\u00E1 passou da meia-noite
		return ini.getTime() - MACRO_TOLERANCIA_H * 3600000;
	}

	// "25/07/2026 06:48 - 3 REINICIO DE VIAGEM" -> {ts, texto}
	function lerMacro(txt) {
		const t = String(txt || '').replace(/\s+/g, ' ').trim();
		if (!t) return null;
		const m = t.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s*-\s*(.*)$/);
		if (!m) return { ts: null, texto: t };
		const d = parseDataBR(m[1] + ' ' + m[2]);
		return { ts: d ? d.getTime() : null, texto: (m[3] || '').trim(), quando: m[1] + ' ' + m[2] };
	}
	const PUNICAO_PRAZO_DIAS = 7; // 7 dias para punir: dt_limite = dt_evento + 7 (edit\u00E1vel na tela)
	const MAP_MID  = '1qnpJ2QIGPJAiWtvbdnu6wY9v4uS2LK4';          // postos policiais Brasil
	const MAP_MID_EXTERIOR = '1GImAEYE-Z3xovn08uAQOTzsvEbS9NvI'; // paises vizinhos (AR/CL/PY/UY/UR/BO)
	const ZOOM     = 12;
	const URL_MAPA       = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/mapapa.php';
	const URL_ALERTAS    = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/atuacao/lista.php';
	const URL_TRATAR_PASSO = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/atuacao/tratar_passo.php';
	const URL_ACOES_AJAX   = 'https://gerenciamento.griscargo.com.br/griscargo/acoes_ajax.php';
	const URL_ACAO_ATUACAO = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/atuacao/acao.php';
	const URL_ATUACAO_DET  = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/atuacao/detalhes.php';
	const URL_COMENTARIO = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/comentarios/acao.php';
	const URL_COMENT_LISTA = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/comentarios/lista.php';
	const URL_SENS_LISTA   = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/alertas/lista.php';
	const URL_SENS_DET     = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/alertas/detalhes.php';
	const URL_SUP_ABERTOS  = 'https://gerenciamento.griscargo.com.br/griscargo/supervisao/abertos.php';
	const URL_SUP_REAG     = 'https://gerenciamento.griscargo.com.br/griscargo/supervisao/reagendamentos.php';
	const URL_REL_VELOC    = 'https://gerenciamento.griscargo.com.br/griscargo/relatorios/velocidades/lista.php';
	const URL_PUN_VEICULOS = 'https://gerenciamento.griscargo.com.br/griscargo/cadastros/punicoes/veiculos.php';
	const URL_PUN_MOTORIST = 'https://gerenciamento.griscargo.com.br/griscargo/cadastros/punicoes/motoristas.php';
	const URL_PUN_ACAO     = 'https://gerenciamento.griscargo.com.br/griscargo/cadastros/punicoes/acao.php';
	const URL_GRID_BASE    = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/grid.php';
	const URL_CMD_ACAO     = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/cmd/acao.php';
	const CD_BASE_SUPERVISAO = '34';

	// VARREDURA: info = codigo da ocorrencia na supervisao; sensor = nome exato no detalhes.php
	// (pendentes: porta carona, porta motorista)

	// cdTipo = tipo da autoriza\u00E7\u00E3o (autoriza_add), usado para liberar o sensor com defeito
	const SENSORES_VARREDURA = [
		{ info: '10', rotulo: 'P\u00E2nico',           sensor: 'P\u00E2nico',           cdTipo: '8'  },
		{ info: '11', rotulo: 'Desengate',        sensor: 'Desengate',        cdTipo: '2'  },
		{ info: '14', rotulo: 'Viola\u00E7\u00E3o Antena',  sensor: 'Sensor Antena',    cdTipo: '7'  },
		{ info: '15', rotulo: 'Viola\u00E7\u00E3o Bateria', sensor: 'Bateria',          cdTipo: '5'  },
		{ info: '16', rotulo: 'Viola\u00E7\u00E3o Painel',  sensor: 'Sensor de Painel', cdTipo: '6'  },
		{ info: '28', rotulo: 'Jammer Ativo',     sensor: 'Jammer Ativo',     cdTipo: '19' },
		{ info: '30', rotulo: 'Teclado Desconectado', sensor: 'Teclado Desconectado', cdTipo: '20' }
	];
	const SENSOR_LIBERACAO_DIAS = 7;

	/* Comando que desabilita o sensor no rastreador, por tecnologia.
	   Cada tecnologia tem seu c\u00F3digo e r\u00F3tulo \u2014 sensor sem comando cadastrado
	   n\u00E3o recebe nada (um c\u00F3digo errado desligaria outro sensor).
	   'habilitar' guarda o par, para reabilitar depois do conserto.           */
	const CMD_SENSOR = {
		'ONIX': {
			'Desengate':           { cd: '42',  label: '17-42-Desabilitar sensor de desengate',      habilitar: { cd: '41',  label: '16-41-Habilitar sensor de desengate' } },
			'Sensor de Painel':    { cd: '54',  label: '26-54-Desbilita Sensor de Painel',           habilitar: { cd: '53',  label: '25-53-Habilita Sensor de Painel' } }
		},
		'SASCAR': {
			'Desengate':           { cd: '42',  label: '18-42-Desabilitar sensor de desengate',      habilitar: { cd: '41',  label: '17-41-Habilitar sensor de desengate' } }
		},
		'SIGHRA': {
			'Teclado Desconectado': { cd: '63', label: '10-63-Desligar Teclado',                     habilitar: { cd: '83',  label: '30-83-Ligar Teclado' } }
		}
	};
	const cmdSensor = (tec, sensor) =>
		(CMD_SENSOR[normalizarTecnologia(tec)] || {})[sensor] || null;
	const VARREDURA_JANELA_H   = 48;  // janela de analise (h)
	const VARREDURA_SPAN_MIN_H = 46;  // span "pleno": constante ha pelo menos 48h
	const VARREDURA_SPAN_MIN_CURTO_H = 22; // historico curto: sistema sem 48h de historico,
	                                       // mas constante por pelo menos ~24h tambem acusa
	                                  // (folga p/ o espacamento entre eventos; pequenos intervalos sao
	                                  //  tolerados pela % minima abaixo)
	const VARREDURA_PCT_MIN    = 90;  // % minima p/ DEFEITO (alarme constante)
	const VARREDURA_PCT_INTERM = 60;  // % minima p/ INTERMITENTE (liga/desliga por 24h+ - avaliar)
	const VARREDURA_SPAN_SAT_MIN_H = 6; // piso de seguranca p/ saturacao: mesmo cobrindo todo o
	                                    // historico, alarmes com menos de 6h nao acusam
	const VARREDURA_SATURACAO   = 0.9;  // "saturado" = alarme cobrindo >= 90% do historico da placa
	                                    // E >= 90% do MAIOR historico observado na rodada (teto medido)
	const VARREDURA_BLOCOS     = 16;  // divide a janela em blocos isolados (48h/16 = 3h cada)
	const VARREDURA_EVT_BLOCO  = 3;   // eventos verificados por bloco (espalhados dentro dele)
	const VARREDURA_COB_MIN    = 90;  // % minima de blocos com o sensor ativo (cobertura da janela)
	const URL_WHATSAPP   = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/whatsapp.php';
	const URL_ENGATE_MOT = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/engate/motorista.php';
	const MAX_POLICIAS = 10;

	// sufixo da anotacao do "Informado via Grupo" 
	const SUFIXO_INFORMADO = ' - informado via grupo do cliente.';
	// ocorr\u00EAncias que n\u00E3o precisam ser informadas ao cliente
	const RE_SEM_INFORMATIVO = /VELOCIDADE/i;
	const ehOcorrenciaSemInformativo = nome => RE_SEM_INFORMATIVO.test(String(nome || ''));
	// janela para aproveitar uma anotacao recente da placa no informativo
	// (quando nao ha condutor/telefone cadastrado)
	const INFORMATIVO_ANOT_MS = 3 * 60 * 60 * 1000;
	/* ================================================================ */

	// remove instalacao anterior (nome novo ou antigo)
	if (typeof T.centralRemover === 'function') { try { T.centralRemover(); } catch (e) {} }
	else if (typeof T.acRemover === 'function') { try { T.acRemover(); } catch (e) {} }
	T.__acWppOff = false; // reativa a captura de telefone

	// rascunhos de anotacoes por placa
	T.__acRascunhos = T.__acRascunhos || {};

	// atualizadores do botao Ligar (definidos em injetarBotoes)
	const TEL_CACHE_MS = 5 * 60 * 1000; // reconsulta o telefone da mesma placa s\u00F3 ap\u00F3s 5 min
	let atualizarLigarBotao = null;   // (telefone) => habilita/desabilita e mostra o numero
	let marcarLigarBuscando = null;   // ()          => estado "buscando..."

	// detecta se a localizacao (Referencia) e de outro pais (nao Brasil)
	// UFs brasileiras nao incluem esses codigos, entao nao ha falso positivo
	const PAISES_EXTERIOR = ['AR', 'CL', 'PY', 'UY', 'UR', 'BO'];
	function ehExterior(posicao) {
		const p = String(posicao || '').toUpperCase();
		const m = p.match(/-\s*([A-Z]{2})\s*$/) || p.match(/\b([A-Z]{2})\s*$/);
		return !!m && PAISES_EXTERIOR.indexOf(m[1]) !== -1;
	}

	// pais pela COORDENADA (BigDataCloud: gratuito, sem chave, direto do navegador).
	// Cache por coordenada; timeout de 4s; null em falha (o chamador cai no texto).
	T.__acPaisCache = T.__acPaisCache || {};
	async function paisPorCoordenada(lat, lon) {
		const la = Number(lat), lo = Number(lon);
		if (!isFinite(la) || !isFinite(lo)) return null;
		const chave = la.toFixed(3) + ',' + lo.toFixed(3);
		if (T.__acPaisCache[chave] !== undefined) return T.__acPaisCache[chave];
		try {
			const ctl = new AbortController();
			const timer = setTimeout(() => ctl.abort(), 4000);
			const res = await fetch(
				`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(la)}&longitude=${encodeURIComponent(lo)}&localityLanguage=pt`,
				{ signal: ctl.signal });
			clearTimeout(timer);
			const j = await res.json();
			const cod = (j && j.countryCode) ? String(j.countryCode).toUpperCase() : null;
			T.__acPaisCache[chave] = cod;
			if (cod) console.log('[PAIS] coordenada', chave, '\u2192', cod);
			return cod;
		} catch (e) {
			console.warn('[PAIS] geocodifica\u00E7\u00E3o falhou, usando o texto da localiza\u00E7\u00E3o:', e);
			return null;
		}
	}

	// verifica se uma linha e uma linha de placa do grid
	function ehLinhaPlaca(tr) {
		if (!tr) return false;
		try {
			if (tr.querySelector('td[data-id="veiculo"]')) return true;
			if (/abrirModalMensagem\(/.test(tr.outerHTML || '')) return true;
			const on = tr.getAttribute('onclick') || tr.getAttribute('onmousedown') || '';
			return /clica\(\s*this\s*,/.test(on);
		} catch (e) { return false; }
	}

	/* ===== REGRAS POR FROTA (Manual de Procedimentos Griscargo) =====
	   contato.modo: 'livre'            -> sem restricao automatizada
	                 'bloquear'         -> NAO contatar o condutor na janela (veiculo parado)
	                 'confirmar'        -> restricao na janela: pergunta antes (veiculo parado)
	                 'confirmar-sempre' -> restricao em QUALQUER horario: pergunta antes
	   Os demais campos (bloqueio, horario, punicao, alertas, sinistro...) sao
	   consultivos e aparecem no painel "Regras da Frota".                    */
	const REGRAS_FROTAS = [
		{ sigla: 'APS', nome: 'APS', re: /\bAPS\b/i,
			bloqueio: 'N\u00E3o aplic\u00E1vel (sem bloqueio na frota)', horario: '',
			condutorDescr: 'Liberado qualquer hor\u00E1rio. No pernoite, ligar para a FROTA apenas se houver suspeita de sinistro.',
			contato: { modo: 'livre' },
			sinistro: 'Ligar direto para Sr. Cl\u00F3vis (qualquer hor\u00E1rio)' },
		{ sigla: 'ATHI', nome: 'ATHIVLOG', re: /ATHIV/i,
			bloqueio: 'N\u00E3o aplic\u00E1vel (sem bloqueio na frota)', horario: '',
			condutorDescr: 'RESTRI\u00C7\u00C3O de contato. Sempre reportar primeiro no grupo operacional.',
			contato: { modo: 'confirmar-sempre', texto: 'RESTRI\u00C7\u00C3O de contato com o condutor: reportar PRIMEIRO no grupo operacional.' },
			sinistro: 'Contatar Sr. Leonardo (qualquer hor\u00E1rio)' },
		{ sigla: 'BELL', nome: 'BELLUNO', re: /BELLUNO/i,
			bloqueio: 'Toda a frota. Exceto CLIENTE, MATRIZ e ALVOS (com autoriza\u00E7\u00E3o de tr\u00E1fego)', horario: '22h00 \u00E0s 05h00',
			alertas: ['DESBLOQUEAR IMPRESCINDIVELMENTE \u00C0S 04H55', 'Punido: desbloqueio S\u00D3 PERMITIDO AP\u00D3S AS 07H00'],
			condutorDescr: 'Sem restri\u00E7\u00E3o de hor\u00E1rio',
			contato: { modo: 'livre' },
			sinistro: 'Contatar Jo\u00E3o e Ivan' },
		{ sigla: 'COLL', punicaoAte: 9, nome: 'COLLI / COLLIBIKE', re: /COLLI/i,
			bloqueio: 'Bloqueio por macro (enviar se n\u00E3o informar). Exceto em CLIENTE, MATRIZ e ALVOS (com autoriza\u00E7\u00E3o de tr\u00E1fego)', horario: '22h00 \u00E0s 05h00 (todos DEVEM enviar pernoite)',
			alertas: ['Puni\u00E7\u00E3o: bloqueio autom\u00E1tico at\u00E9 as 09h00 para quem n\u00E3o enviar macro de FIM DE JORNADA'],
			condutorDescr: 'RESTRI\u00C7\u00C3O de contato em hor\u00E1rio de pernoite',
			contato: { modo: 'confirmar', ini: 22, fim: 5, texto: 'RESTRI\u00C7\u00C3O de contato com o condutor em hor\u00E1rio de pernoite.' },
			sinistro: 'Contatar Adriano (qualquer hor\u00E1rio)' },
		{ sigla: 'FALL', punicaoAte: 10, nome: 'FALLEIRO / TRANSFALLEIRO', re: /FALLEIRO/i,
			bloqueio: 'Bloqueio por macro (enviar se n\u00E3o informar). Exceto em CLIENTE, MATRIZ e ALVOS (com autoriza\u00E7\u00E3o de tr\u00E1fego)', horario: '23h00 \u00E0s 05h00 (pernoite obrigat\u00F3rio at\u00E9 23h00; desbloqueio autorizado a partir das 04h15)',
			alertas: ['Puni\u00E7\u00E3o: bloqueio autom\u00E1tico at\u00E9 as 10h00 para quem n\u00E3o enviar a macro'],
			condutorDescr: 'OBRIGAT\u00D3RIO verificar c\u00E2meras antes. Se n\u00E3o carregarem e houver suspeita de sinistro, efetuar o contato.',
			contato: { modo: 'confirmar', ini: 23, fim: 5, texto: 'OBRIGAT\u00D3RIO verificar as c\u00E2meras antes. Se n\u00E3o carregarem e houver suspeita de sinistro, efetuar o contato.' },
			sinistro: 'Contatar Cleison, Diego ou Fabiula' },
		{ sigla: 'FLIN', nome: 'FLINTEM', re: /FLINTEM/i,
			bloqueio: 'Pernoite para viagens lan\u00E7adas na Griscargo (exceto com autoriza\u00E7\u00E3o de tr\u00E1fego). Sempre cobrar as macros.', horario: '23h00 \u00E0s 05h00',
			condutorDescr: 'Sem restri\u00E7\u00E3o de contato',
			contato: { modo: 'livre' },
			sinistro: 'Contatar Sra. Nat\u00E1lia' },
		{ sigla: 'FRIB', nome: 'FRIBON', re: /FRIBON/i,
			bloqueio: 'Toda a frota. Exceto CLIENTE, MATRIZ e ALVOS (com autoriza\u00E7\u00E3o de tr\u00E1fego)', horario: '22h00 \u00E0s 05h00',
			alertas: ['Puni\u00E7\u00E3o: tempo INDETERMINADO \u2014 desbloqueio S\u00D3 autorizado pelos frotas da pr\u00F3pria transportadora'],
			condutorDescr: 'Sem restri\u00E7\u00E3o de hor\u00E1rio',
			contato: { modo: 'livre' },
			sinistro: 'Contatar o respons\u00E1vel indicado no campo "IDENTIFICADOR" na ONIX' },
		{ sigla: 'GENT', nome: 'GENTUR', re: /GENTUR/i,
			bloqueio: 'N\u00E3o aplic\u00E1vel (sem bloqueio na frota)', horario: '',
			condutorDescr: 'Sem restri\u00E7\u00E3o de hor\u00E1rio para contato com condutor e gestor',
			contato: { modo: 'livre' },
			sinistro: 'Contatar C\u00E1ssio' },
		{ sigla: 'GILM', nome: 'GILMAR', re: /GILMAR/i,
			bloqueio: 'Pernoite para viagens lan\u00E7adas na Griscargo (exceto com autoriza\u00E7\u00E3o de tr\u00E1fego)', horario: '23h00 \u00E0s 05h00',
			condutorDescr: 'Sem restri\u00E7\u00E3o de hor\u00E1rio para contato com condutor e gestor',
			contato: { modo: 'livre' },
			sinistro: 'Contatar Sr. Gilmar' },
		{ sigla: 'INTE', nome: 'INTERCITY', re: /INTERCITY/i,
			bloqueio: 'N\u00E3o aplic\u00E1vel (sem bloqueio na frota)', horario: '',
			condutorDescr: 'Sem restri\u00E7\u00E3o de hor\u00E1rio para contato com condutor e gestor',
			contato: { modo: 'livre' },
			sinistro: 'Contatar Sr. Paulo' },
		{ sigla: 'JRTR', nome: 'JR TRANSPORTES', re: /\bJR\b/i,
			bloqueio: 'Bloquear para pernoite IMEDIATAMENTE assim que o ve\u00EDculo parar, independente do hor\u00E1rio. Sempre cobrar as macros.', horario: 'Imediato ao parar',
			condutorDescr: 'Sem restri\u00E7\u00E3o de hor\u00E1rio para contato com condutor e gestor',
			contato: { modo: 'livre' },
			sinistro: 'Contatar Sr. Jo\u00E3o' },
		{ sigla: 'NINO', nome: 'NINO', re: /\bNINO\b/i,
			bloqueio: 'Pernoite para viagens lan\u00E7adas na Griscargo (exceto com autoriza\u00E7\u00E3o de tr\u00E1fego)', horario: '23h00 \u00E0s 05h00',
			condutorDescr: 'Sem restri\u00E7\u00E3o de hor\u00E1rio para contato com condutor e gestor',
			contato: { modo: 'livre' },
			sinistro: 'Contatar Claudiomar, Daimar ou Daimir' },
		{ sigla: 'PECA', nome: 'PECAL', re: /PECAL/i,
			bloqueio: 'Toda a frota. Exceto GERDAU, PECAL e USINA (ou com autoriza\u00E7\u00E3o de tr\u00E1fego)', horario: '22h00 \u00E0s 05h00',
			alertas: ['DESBLOQUEAR IMPRESCINDIVELMENTE \u00C0S 04H55', 'Geram muitos desvios de rota: se j\u00E1 estiver na cidade de destino e pr\u00F3ximo ao cliente, PODE FINALIZAR A VIAGEM'],
			condutorDescr: 'N\u00C3O contatar em hor\u00E1rio de pernoite',
			contato: { modo: 'bloquear', ini: 22, fim: 5 },
			sinistro: 'Contatar Sr. Fabr\u00EDcio' },
		{ sigla: 'RODO', nome: 'RODOBENDER', re: /RODOBENDER/i,
			bloqueio: 'Pernoite para viagens lan\u00E7adas na Griscargo (exceto com autoriza\u00E7\u00E3o de tr\u00E1fego)', horario: '22h00 \u00E0s 05h00',
			condutorDescr: 'Sem restri\u00E7\u00E3o de hor\u00E1rio para contato com condutor e gestor',
			contato: { modo: 'livre' },
			sinistro: 'Contatar Sr. Semir ou Lucas' },
		{ sigla: 'ROSS', punicaoAte: 9, nome: 'ROSSINI', re: /ROSSINI/i,
			bloqueio: 'APENAS para ve\u00EDculos no estado de S\u00E3o Paulo (SP). Informar no grupo do cliente os ve\u00EDculos em circula\u00E7\u00E3o fora do hor\u00E1rio.', horario: '22h00 \u00E0s 05h00',
			alertas: ['Punido: desbloqueio S\u00D3 A PARTIR DAS 09H00', 'Desengate permitido das 08h00 \u00E0s 18h00 (todos). Em \u00E1rea de exce\u00E7\u00E3o, N\u00C3O BLOQUEAR.', 'N\u00C3O CONTATAR GESTORES EM HIP\u00D3TESE ALGUMA'],
			condutorDescr: 'N\u00C3O contatar em hor\u00E1rio de pernoite. Gestores: nunca.',
			contato: { modo: 'bloquear', ini: 22, fim: 5, texto: 'N\u00C3O contatar gestores em hip\u00F3tese alguma.' },
			sinistro: 'Ligar para Jo\u00E3o ou Cocada' },
		{ sigla: 'TESB', nome: 'TESBA', re: /TESBA/i,
			bloqueio: 'Bloqueio TOTAL da frota. Ve\u00EDculos sempre com lacre de motor ativo.', horario: '22h00 \u00E0s 04h00',
			condutorDescr: '(sem regra espec\u00EDfica de condutor no manual)',
			contato: { modo: 'livre' },
			sinistro: 'Acionar na ordem: 1. Jos\u00E9 / 2. Matheus / 3. Leonardo' },
		{ sigla: 'TERC', nome: 'TERCEIRO', re: /TERCEIR/i,
			bloqueio: 'N\u00E3o aplic\u00E1vel (sem bloqueio). Monitoramento com apoio de c\u00E2meras.', horario: '',
			condutorDescr: 'N\u00C3O contatar o condutor. Informar no grupo operacional. Exce\u00E7\u00E3o apenas para situa\u00E7\u00F5es extremas.',
			contato: { modo: 'confirmar-sempre', texto: 'N\u00C3O contatar o condutor \u2014 informar no grupo operacional. Prosseguir APENAS em situa\u00E7\u00E3o extrema.' },
			sinistro: 'Contatar Eduardo (sempre informando no grupo)' },
		{ sigla: 'TVBL', nome: 'TRANS VB LOG\u00CDSTICA', re: /TRANS\s*VB/i,
			bloqueio: 'N\u00E3o aplic\u00E1vel (sem bloqueio na frota)', horario: 'Restri\u00E7\u00E3o de tr\u00E1fego das 21h30 \u00E0s 04h00',
			condutorDescr: 'Sem restri\u00E7\u00E3o de hor\u00E1rio para contato com condutor e gestor',
			contato: { modo: 'livre' },
			sinistro: 'Contatar Sr. Germano' },
		{ sigla: 'ZAPE', nome: 'TRANSZAPE', re: /ZAPE/i,
			bloqueio: 'Toda a frota. Exceto CLIENTE, MATRIZ e ALVOS (com autoriza\u00E7\u00E3o de tr\u00E1fego)', horario: '21h00 \u00E0s 05h00',
			alertas: ['Verificar se possui isca. Acionar Pancare em suspeita de sinistro ou perda de sinal maior que 60 minutos.', 'Filial Ara\u00E7atuba atende as frotas at\u00E9 as 02h00'],
			condutorDescr: 'Sempre realizar contato, independente do hor\u00E1rio',
			contato: { modo: 'livre' },
			sinistro: 'Ordem: 1. Jhonatan / 2. Jonas / 3. Vinicius / 4. Filial Ara\u00E7atuba (at\u00E9 02h00) / 5. Sr. L\u00FAcio (casos extremos)' },
		{ sigla: 'VELL', nome: 'VELLOSO E LEAL', re: /VELLOSO/i,
			bloqueio: 'N\u00E3o aplic\u00E1vel (sem bloqueio na frota; bloqueio feito por macro)', horario: '',
			condutorDescr: 'Sem restri\u00E7\u00E3o de hor\u00E1rio para contato com condutor e gestor',
			contato: { modo: 'livre' },
			sinistro: 'Contatar Sr. Adriano Lino e Tiago' },
		{ sigla: 'VOLC', nome: 'VOLCANO / OVERALL', re: /VOLCANO|OVERALL/i,
			bloqueio: 'N\u00E3o aplic\u00E1vel (sem bloqueio na frota)', horario: '',
			condutorDescr: 'Sem restri\u00E7\u00E3o de hor\u00E1rio para contato com condutor e gestor',
			contato: { modo: 'livre' },
			sinistro: 'Contatar Sr. Valfredo ou F\u00E1bio' },
		{ sigla: 'ZANI', nome: 'ZANINI', re: /ZANINI/i,
			bloqueio: 'Pernoite para viagens lan\u00E7adas na Griscargo (exceto com autoriza\u00E7\u00E3o de tr\u00E1fego). Sempre verificar a isca das carretas.', horario: '21h00 \u00E0s 05h00',
			condutorDescr: 'N\u00C3O ligar em hor\u00E1rio de pernoite (principalmente em cliente/aduana). Ligar para a frota apenas em situa\u00E7\u00F5es extremas.',
			contato: { modo: 'bloquear', ini: 21, fim: 5, texto: 'N\u00E3o ligar em pernoite (principalmente em cliente/aduana). Frota apenas em situa\u00E7\u00F5es extremas. Informar tudo via grupo operacional.' },
			sinistro: 'Contatar Andr\u00E9' }
	];

	function detectarFrota(cliente) {
		const c = String(cliente || '');
		if (!c) return null;
		for (const f of REGRAS_FROTAS) { if (f.re.test(c)) return f; }
		return null;
	}

	/* ===== CONTATOS DE FROTA (passo "contato com a transportadora") =====
	   Extensivel: adicionar as demais transportadoras quando os contatos
	   forem passados. tel = somente digitos (DDD + numero).               */
	const FROTAS_CONTATO = [
		{ re: /\bAPS\b/i, nome: 'APS',
			avisoPernoite: { ini: 22, fim: 5, texto: 'No pernoite, ligar para a frota APENAS se houver suspeita de sinistro.' },
			contatos: [
				{ nome: 'CAU\u00C3',   tel: '4799871867' },
				{ nome: 'MAYARA', tel: '4791689624' },
				{ nome: 'CARLA',  tel: '4791474995' },
				{ nome: 'CLOVIS', tel: '4788052000' }
			] },
		{ re: /ZAPE/i, nome: 'TRANSZAPE',
			contatos: [
				{ nome: 'JONAS',    tel: '4888249730' },
				{ nome: 'JONATHAN', tel: '4888175469' }
			] }
	];

	function frotaContatosDoCliente(cliente) {
		const c = String(cliente || '');
		if (!c) return null;
		for (const f of FROTAS_CONTATO) { if (f.re.test(c)) return f; }
		return null;
	}

	// janela pode cruzar a meia-noite (ex.: 22 -> 5)
	function emJanela(ini, fim, minAgora) {
		const d = new Date();
		const min = (typeof minAgora === 'number') ? minAgora : (d.getHours() * 60 + d.getMinutes());
		const a = ini * 60, b = fim * 60;
		return (a <= b) ? (min >= a && min < b) : (min >= a || min < b);
	}

	function textoPernoite(regra) {
		if (!regra) return '';
		const prefixo = regra.transp ? regra.transp + ': ' : '';
		if (regra.inicio == null) {
			return prefixo + (regra.texto || 'Restri\u00E7\u00E3o de contato com o condutor.');
		}
		const p2 = n => String(n).padStart(2, '0');
		let msg = `${prefixo}ve\u00EDculo em hor\u00E1rio de pernoite das ${p2(regra.inicio)}h00 \u00E0s ${p2(regra.fim == null ? 5 : regra.fim)}h00.`;
		if (regra.texto) msg += '\n' + regra.texto;
		return msg;
	}

	// janela de pernoite/bloqueio da frota, lida do campo HORARIO do manual
	// ("22h00 \u00E0s 05h00", "Restri\u00E7\u00E3o de tr\u00E1fego das 21h30 \u00E0s 04h00"...).
	// Frotas sem janela (APS, Gentur, JR "imediato ao parar") devolvem null.
	function janelaPernoiteFrota(f) {
		if (!f) return null;
		if (f.__janela !== undefined) return f.__janela;
		const m = String(f.horario || '')
			.match(/(\d{1,2})\s*h\s*(\d{2})?\s*(?:\u00E0s|as)\s*(\d{1,2})\s*h\s*(\d{2})?/i);
		f.__janela = m ? {
			iniMin: (+m[1]) * 60 + (+(m[2] || 0)),
			fimMin: (+m[3]) * 60 + (+(m[4] || 0))
		} : null;
		return f.__janela;
	}

	function fmtHoraMin(min) {
		return String(Math.floor(min / 60)).padStart(2, '0') + 'h' + String(min % 60).padStart(2, '0');
	}

	// nota acrescentada \u00E0s anota\u00E7\u00F5es de tentativa sem sucesso, quando o hor\u00E1rio
	// atual est\u00E1 dentro da janela de pernoite da frota (justifica a falta de retorno)
	/* A nota de pernoite s\u00F3 faz sentido onde a frota REALMENTE restringe o
	   contato com o condutor nesse hor\u00E1rio. Frota com contato livre pode ser
	   chamada de madrugada \u2014 anotar pernoite ali confunde o registro.        */
	function notaPernoite(cliente) {
		const f = detectarFrota(cliente);
		const modo = (f && f.contato && f.contato.modo) || 'livre';
		if (modo !== 'bloquear' && modo !== 'confirmar') return '';
		const j = janelaPernoiteFrota(f);
		if (!j) return '';
		const d = new Date();
		const min = d.getHours() * 60 + d.getMinutes();
		const dentro = (j.iniMin <= j.fimMin)
			? (min >= j.iniMin && min < j.fimMin)
			: (min >= j.iniMin || min < j.fimMin);
		if (!dentro) return '';
		return `Ve\u00EDculo em hor\u00E1rio de pernoite das ${fmtHoraMin(j.iniMin)} \u00E0s ${fmtHoraMin(j.fimMin)}.`;
	}

	// junta a nota de pernoite ao texto da anota\u00E7\u00E3o, sem duplicar
	function comNotaPernoite(texto, cliente) {
		const base = String(texto || '').replace(/\s+/g, ' ').trim();
		if (/hor\u00E1rio de pernoite/i.test(base)) return base;
		const nota = notaPernoite(cliente);
		return nota ? (base ? base + ' ' + nota : nota) : base;
	}

	/* ===== USUARIO LOGADO =====
	   O portal embute o usuario no onclick do icone de chat de cada linha do grid:
	   abrirModalMensagem(cd_veiculo,"PLACA","NOME","numero","numero2","USUARIO","evento").
	   Alternativa: hidden "usuario" do modal do blip. Override manual: centralUsuario('NOME'). */
	function usuarioAtual() {
		if (T.__acUsuario) return String(T.__acUsuario).trim();
		let achou = '';
		(function walk(j) {
			if (achou) return;
			try {
				const doc = j.document;
				if (doc) {
					const el = doc.querySelector('[onclick*="abrirModalMensagem"]');
					if (el) {
						const on = (el.getAttribute('onclick') || '').replace(/&quot;/g, '"');
						const m = on.match(/abrirModalMensagem\(\s*\d+\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"([^"]*)"/i);
						if (m && m[1].trim()) { achou = m[1].trim(); return; }
					}
					const inp = doc.querySelector('#usuario, [name="usuario"], #modal_usuario, [name="modal_usuario"]');
					if (inp && (inp.value || '').trim()) { achou = inp.value.trim(); return; }
				}
				for (let i = 0; i < j.frames.length && !achou; i++) walk(j.frames[i]);
			} catch (e) { }
		})(T);
		return achou;
	}

	/* Operadores sem restri\u00E7\u00E3o: podem definir a data/hora do reagendamento e
	   enviar comandos em massa fora da janela da madrugada. Falha fechada \u2014
	   se o usu\u00E1rio n\u00E3o for identificado, as restri\u00E7\u00F5es valem.               */
	const USUARIOS_SEM_RESTRICAO = [/WEL[I\u00CD]NGTON/i];
	function usuarioSemRestricao() {
		const u = usuarioAtual();
		return !!u && USUARIOS_SEM_RESTRICAO.some(re => re.test(u));
	}
	const podeEditarReagendamento = usuarioSemRestricao;

	// ignora as ocorrencias "Bloquear Pernoite" e "Desbloquear Pernoite"
	function ehPernoiteIgnorada(nome) {
		return /^\s*(des)?bloquear\s+pernoite\s*$/i.test(String(nome || ''));
	}

	// ocorrencias que NAO entram nas anotacoes/informativos (automaticas do sistema):
	// Bloquear/Desbloquear Pernoite e Estado DESATIVADO (qualquer tecnologia)
	function ehOcorrenciaOculta(nome) {
		return ehPernoiteIgnorada(nome) || /^\s*estado\s+desativado\b/i.test(String(nome || ''));
	}

	// regra de contato com o condutor ativa para o cliente, ou null.
	// - 'confirmar-sempre' (Athivlog/Terceiro): vale em qualquer horario, mesmo em movimento.
	// - 'bloquear'/'confirmar': so na janela de pernoite e com o veiculo parado
	//   (vel = 0; velocidade desconhecida mantem a restricao).
	function pernoiteBloqueio(cliente, velocidade) {
		const f = detectarFrota(cliente);
		if (!f || !f.contato || f.contato.modo === 'livre') return null;
		const c = f.contato;
		if (c.modo === 'confirmar-sempre') {
			return { transp: f.nome, permiteLigar: true, inicio: null, fim: null, texto: c.texto || '' };
		}
		if (typeof velocidade === 'number' && velocidade > 0) return null;
		const fim = (c.fim == null ? 5 : c.fim);
		if (!emJanela(c.ini, fim)) return null;
		return { transp: f.nome, permiteLigar: (c.modo === 'confirmar'), inicio: c.ini, fim: fim, texto: c.texto || '' };
	}

	// linha (tr) do veiculo no grid, a partir do doc
	function linhaDoVeiculo(doc, cdVeiculo) {
		try {
			const loc = doc.getElementById('ds_posicao_' + cdVeiculo);
			return loc ? loc.closest('tr') : null;
		} catch (e) { return null; }
	}

	// velocidade (km/h) da linha; null se nao der pra ler
	function velocidadeDaLinha(tr) {
		if (!tr) return null;
		const td = tr.querySelector('td[data-id="vel"]');
		if (!td) return null;
		const v = parseInt((td.textContent || '').replace(/\D/g, ''), 10);
		return isNaN(v) ? null : v;
	}

	// cliente (transportadora) da linha do veiculo, a partir do doc do grid
	function clienteDoVeiculo(doc, cdVeiculo) {
		const tr = linhaDoVeiculo(doc, cdVeiculo);
		if (tr) {
			const td = tr.querySelector('td[data-id="cliente"]');
			if (td) return (td.textContent || '').trim();
		}
		return '';
	}

	// faixas aproximadas do Brasil
	const ehLat = n => n >= -34.5 && n <= 6;
	const ehLng = n => n >= -75   && n <= -34;

	// escapes html
	const escHtml = s => String(s == null ? '' : s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
	const escAttr = s => escHtml(s).replace(/"/g, '&quot;');

	/* ---------------------- utilidades ---------------------- */
	function escFechar(e) { if (e.key === 'Escape') fecharModal(); }

	function fecharModal() {
		const m = D.getElementById('modal-mapa-acionamento');
		if (m) m.remove();
		D.removeEventListener('keydown', escFechar, true);
	}

	function copiar(txt, btn, rotulo) {
		const ok = () => {
			if (!btn) return;
			btn.textContent = '\u2714 Copiado';
			setTimeout(() => { btn.textContent = rotulo; }, 1500);
		};
		const fb = () => {
			const ta = D.createElement('textarea');
			ta.value = txt;
			D.body.appendChild(ta);
			ta.select();
			try { D.execCommand('copy'); ok(); } catch (e) {}
			ta.remove();
		};
		if (T.navigator.clipboard && T.navigator.clipboard.writeText) {
			T.navigator.clipboard.writeText(txt).then(ok, fb);
		} else {
			fb();
		}
	}

	function copiarSilencioso(txt) {
		if (T.navigator.clipboard && T.navigator.clipboard.writeText) {
			return T.navigator.clipboard.writeText(txt).catch(() => copiarFallback(txt));
		}
		copiarFallback(txt);
		return Promise.resolve();
	}

	function copiarFallback(txt) {
		const ta = D.createElement('textarea');
		ta.value = txt;
		D.body.appendChild(ta);
		ta.select();
		try { D.execCommand('copy'); } catch (e) {}
		ta.remove();
	}

	function stripHtmlAndPreserveNewlines(htmlStr) {
		let temp = D.createElement('div');
		temp.innerHTML = htmlStr.replace(/<br\s*\/?>/gi, '[[BR]]');
		let text = temp.textContent || temp.innerText || '';
		return text.replace(/\[\[BR\]\]/g, '\n').trim();
	}

	// Adiciona o dígito 9 em celulares que estejam faltando
	function adicionarNoveSeCelularBR(numero) {
		if (!numero) return '';
		const bruto = String(numero).replace(/\D/g, '');
		const ddi = (bruto.startsWith('55') && bruto.length >= 12) ? '55' : '';
		let n = soDigitosBR(numero);
		// Se possuir exatos 10 dígitos (DDD + 8 dígitos) e for celular (iniciando com 6,7,8,9)
		if (n.length === 10) {
			const primeiroDigitoNumero = parseInt(n.charAt(2), 10);
			if (primeiroDigitoNumero >= 6) {
				n = n.substring(0, 2) + '9' + n.substring(2);
			}
		}
		return ddi + n;
	}

	// Prepara numero para SIP
	function formatarSip(numStr) {
		let n = adicionarNoveSeCelularBR(numStr).replace(/\D/g, '');
		if (n.startsWith('55') && n.length >= 12) {
			n = n.substring(2);
		}
		if (n.length < 3) return null;
		return 'sip:0' + n;
	}

	// numero p/ exibicao
	function formatarExibicaoNumero(dig) {
		let n = adicionarNoveSeCelularBR(dig).replace(/\D/g, '');
		if (n.startsWith('55') && n.length >= 12) n = n.substring(2);
		if (n.length === 11) return `${n.slice(0, 2)} ${n.slice(2, 7)}-${n.slice(7)}`;
		if (n.length === 10) return `${n.slice(0, 2)} ${n.slice(2, 6)}-${n.slice(6)}`;
		return n;
	}

	// Isola o ULTIMO numero de telefone
	const extrairUltimoNumero = (txt) => {
		if (!txt) return '';
		const txtLimpo = String(txt).replace(/[\(\)\-\s]/g, '');
		const matches = txtLimpo.match(/\d{3,15}/g);
		if (matches && matches.length > 0) {
			return adicionarNoveSeCelularBR(matches[matches.length - 1]);
		}
		return '';
	};

	/* ---------- envio de comentario (compartilhado) ---------- */
	async function enviarComentarioVeiculo(texto, cdVeiculo) {
		const url = `${URL_COMENTARIO}?tp1=1&tp2=1&ds_comentario=${escape(texto).replace(/\+/g, '%2B')}&cd_veiculo=${cdVeiculo}`;
		return fetch(url, {
			headers: {
				"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
				"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
				"upgrade-insecure-requests": "1"
			},
			method: "GET",
			mode: "cors",
			credentials: "include"
		}).then(res => res.text());
	}

	/* =========================================================
	   0. CAPTURA DO TELEFONE DO MOTORISTA AO CLICAR NA PLACA
	   ========================================================= */
	function extrairCdMotorista(tr) {
		if (!tr) return '';

		const tdMot = tr.querySelector('td[data-id="motorista"]');
		if (tdMot) {
			const mw = (tdMot.innerHTML || '').match(/whats\(\s*this\s*,\s*(\d+)\s*\)/i);
			if (mw) return mw[1];
		}

		const onAttr = tr.getAttribute('onclick') || tr.getAttribute('onmousedown') || '';
		const mc = onAttr.match(/clica\(\s*this\s*,\s*(?:'[^']*'\s*,\s*){10}'([^']*)'/i);
		if (mc) return mc[1];

		const mh = (tr.outerHTML || '').match(/whats\(\s*this\s*,\s*(\d+)\s*\)/i);
		return mh ? mh[1] : '';
	}

	async function buscarTelefoneMotorista(cdMotorista) {
		const url = `${URL_WHATSAPP}?cd_motorista=${encodeURIComponent(cdMotorista)}&dhxr${Date.now()}=1`;
		const res = await fetch(url, {
			headers: {
				"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
				"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
				"upgrade-insecure-requests": "1"
			},
			method: "GET",
			mode: "cors",
			credentials: "include"
		});
		const txt = await res.text();

		let fone = '';
		try {
			const doc = new DOMParser().parseFromString(txt, 'text/html');
			fone = (doc.querySelector('#nr_fone')?.getAttribute('value') || '').trim();
		} catch (e) {}

		if (!fone) {
			const mm = txt.match(/id=["']nr_fone["'][^>]*value=["'](\d+)["']/i)
			        || txt.match(/name=["']nr_fone["'][^>]*value=["'](\d+)["']/i);
			if (mm) fone = mm[1];
		}
		
		let telFormatado = fone.replace(/\D/g, '');
		return adicionarNoveSeCelularBR(telFormatado);
	}

	// proprietario (cd_clifor) = 7o argumento de clica(this, mct, placa, veiculo, dt, viagem, frota, PROPRIETARIO, ...)
	function extrairProprietario(tr) {
		if (!tr) return '';
		const on = tr.getAttribute('onclick') || tr.getAttribute('onmousedown') || '';
		const m = on.match(/clica\(\s*this\s*,\s*(?:'[^']*'\s*,\s*){6}'([^']*)'/i);
		return m ? m[1] : '';
	}

	// telefone do condutor a partir do engate/motorista.php (Telefone1 do Motorista1)
	async function buscarTelefoneCondutor(cdVeiculo, cdProprietario) {
		if (!cdVeiculo) return '';
		const url = `${URL_ENGATE_MOT}?cd_veiculo=${encodeURIComponent(cdVeiculo)}&cd_clifor=${encodeURIComponent(cdProprietario || '')}`;
		const res = await fetch(url, {
			headers: {
				"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
				"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
				"upgrade-insecure-requests": "1"
			},
			method: "GET",
			mode: "cors",
			credentials: "include"
		});
		const buf = await res.arrayBuffer();
		const txt = new TextDecoder('windows-1252').decode(buf);
		return parseTelefoneEngate(txt);
	}

	// numero e celular BR? (11 dig: 3o digito 9; ou 10 dig antigo: 3o digito 6-9)
	/* Alguns cadastros trazem o 0 de disca\u00E7\u00E3o antes do DDD (06294075335).
	   Sem tirar esse zero o script l\u00EA o DDD errado e descarta o n\u00FAmero.     */
	function soDigitosBR(numero) {
		let n = String(numero || '').replace(/\D/g, '');
		if (n.startsWith('55') && n.length >= 12) n = n.substring(2);   // DDI
		if (n.startsWith('0') && (n.length === 11 || n.length === 12)) n = n.substring(1);  // 0 + DDD
		if (n.startsWith('55') && n.length >= 12) n = n.substring(2);   // 0 + 55 + DDD
		return n;
	}

	// DDD do Brasil: 11 a 99, sem os c\u00F3digos que n\u00E3o existem
	const DDD_INVALIDOS = [20, 23, 25, 26, 29, 30, 36, 39, 40, 50, 52, 56, 57, 58, 59, 60, 70, 72, 76, 78, 80, 90];
	function dddPlausivel(numero) {
		const n = String(numero || '').replace(/\D/g, '');
		if (n.length < 10) return false;
		const ddd = parseInt(n.substring(0, 2), 10);
		return ddd >= 11 && ddd <= 99 && DDD_INVALIDOS.indexOf(ddd) === -1;
	}

	function ehCelular(numero) {
		let n = soDigitosBR(numero);
		if (n.length === 11) return n.charAt(2) === '9';
		if (n.length === 10) {
			const d = parseInt(n.charAt(2), 10);
			return d >= 6;
		}
		return false;
	}

	// telefone valido = DDD + numero (>=10 digitos), ignorando o DDI 55
	function telValido(numero) {
		const n = soDigitosBR(numero);
		if (n.length < 10 || n.length > 13) return false;
		if (/^(\d)\1+$/.test(n)) return false;                      // 9999999999
		if (/^(?:0123456789|1234567890)/.test(n)) return false;      // sequ\u00EAncia
		return dddPlausivel(n);
	}

	// escolhe o telefone do condutor entre TODOS os cadastrados (Telefone1, Telefone2, ...).
	// prioridade: 1) celular (na ordem em que aparece) -> 2) fixo/qualquer valido (DDD + numero)
	// -> 3) numero curto (sem DDD) como ultimo recurso.
	// Ou seja: havendo so fixo, o fixo e usado; havendo celular, ele sempre vence.
	function escolherTelefoneMotorista() {
		const tels = Array.prototype.slice.call(arguments)
			.reduce((acc, a) => acc.concat(Array.isArray(a) ? a : [a]), [])
			.map(t => String(t || '').replace(/\D/g, ''))
			.filter(Boolean);
		if (!tels.length) return '';
		const celular = tels.find(ehCelular);
		if (celular) return soDigitosBR(celular);
		const fixo = tels.find(telValido);
		if (fixo) { console.log('[CONTATO] sem celular cadastrado \u2014 usando o fixo', fixo); return soDigitosBR(fixo); }
		return soDigitosBR(tels[0]);
	}

	// coleta TODOS os telefones do Motorista1 (Telefone1, Telefone2, Celular, Fone...)
	// e escolhe o melhor: celular primeiro; so fixo -> usa o fixo.
	function parseTelefoneEngate(html) {
		try {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			const tds = Array.from(doc.querySelectorAll('td'));
			const tels = [];
			for (let i = 0; i < tds.length; i++) {
				const rot = (tds[i].textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
				// para no bloco do proximo motorista (so os contatos do condutor atual)
				if (tels.length && /^motorista\s*2\b/.test(rot)) break;
				if (/^(telefone|fone|celular|cel\b|tel\b)/.test(rot)) {
					const val = (tds[i + 1] ? (tds[i + 1].textContent || '') : '').replace(/\D/g, '');
					if (val) tels.push(val);
				}
			}
			if (tels.length) return escolherTelefoneMotorista(tels);
		} catch (e) {}
		return '';
	}

	// busca o telefone da placa clicada e mostra no botao Ligar
	// (o numero fica visivel no proprio botao; nao mexemos na area de transferencia)
	function atualizarLigarParaLinha(tr) {
		if (!tr || !ehLinhaPlaca(tr)) return;
		const cdVeiculo = (tr.querySelector('td[data-id="localizacao"]')?.id || '').replace('ds_posicao_', '');
		const cdProp    = extrairProprietario(tr);
		const cliente   = tr.querySelector('td[data-id="cliente"]')?.textContent.trim() || '';
		if (!cdVeiculo) { if (atualizarLigarBotao) atualizarLigarBotao(''); return; }

		// mesma placa j\u00E1 resolvida h\u00E1 pouco: reaplica o n\u00FAmero em cache, sem novo fetch.
		// (o grid se atualiza sozinho e reemite a sele\u00E7\u00E3o o tempo todo)
		const cache = T.__acContatoAtual;
		if (cache && cache.cdVeiculo === cdVeiculo && cache.t && (Date.now() - cache.t) < TEL_CACHE_MS) {
			if (atualizarLigarBotao) atualizarLigarBotao(cache.telefone || '');
			try { consoleAtualizarPlaca(); } catch (e) { }
			return;
		}

		if (marcarLigarBuscando) marcarLigarBuscando();
		try { consoleAtualizarPlaca(); } catch (e) { }

		// controle de corrida: so aplica o resultado da selecao mais recente
		const seq = (T.__acTelSeq = (T.__acTelSeq || 0) + 1);
		buscarTelefoneCondutor(cdVeiculo, cdProp).then(tel => {
			if (seq !== T.__acTelSeq) return;
			T.__acContatoAtual = { cdVeiculo: cdVeiculo, telefone: tel, cliente: cliente, t: Date.now() };
			if (atualizarLigarBotao) atualizarLigarBotao(tel);
		}).catch(() => {
			if (seq !== T.__acTelSeq) return;
			T.__acContatoAtual = { cdVeiculo: cdVeiculo, telefone: '', cliente: cliente, t: Date.now() };
			if (atualizarLigarBotao) atualizarLigarBotao('');
		});
	}

	// copia o numero so quando o operador pede (clique com o botao direito no Ligar)
	function copiarNumeroSobDemanda(ev, numero) {
		const dig = String(numero || '').replace(/\D/g, '');
		if (!dig) return;
		ev.preventDefault();
		copiarSilencioso(dig);
		console.log('[CENTRAL] n\u00FAmero copiado:', formatarExibicaoNumero(dig));
	}

	function onClickCaptura(ev) {
		if (T.__acWppOff) return;
		const alvo = ev.target;
		const tr = (alvo && alvo.closest) ? alvo.closest('tr') : null;
		if (!tr || !ehLinhaPlaca(tr)) return;

		const cdVeiculo = (tr.querySelector('td[data-id="localizacao"]')?.id || '').replace('ds_posicao_', '');
		if (!cdVeiculo) return;

		// evita refazer a busca em cliques repetidos rapidos na MESMA placa
		const agora = Date.now();
		if (T.__acLigarUltimo && T.__acLigarUltimo.cd === cdVeiculo && (agora - T.__acLigarUltimo.t) < 1000) return;
		T.__acLigarUltimo = { cd: cdVeiculo, t: agora };

		atualizarLigarParaLinha(tr);
	}

	/* =========================================================
	   0c. DESMARCAR "Atualizar OBS no Grid" (#ckgrid) AO APARECER
	   ========================================================= */
	function desmarcarCkGridDoc(doc) {
		let cbs = [];
		try {
			// 1) direto por id ou name
			doc.querySelectorAll('input[type="checkbox"]#ckgrid, input[type="checkbox"][name="ckgrid"]')
				.forEach(c => cbs.push(c));

			// 2) pelo label (for="ckgrid" ou texto "Atualizar OBS no Grid")
			doc.querySelectorAll('label').forEach(lb => {
				const txt = (lb.textContent || '').trim().toLowerCase();
				const forId = lb.getAttribute('for');
				if (forId === 'ckgrid' || txt.indexOf('atualizar obs no grid') !== -1) {
					let alvo = null;
					if (forId) { try { alvo = doc.getElementById(forId); } catch (e) {} }
					if (!alvo) alvo = lb.querySelector('input[type="checkbox"]');
					if (!alvo && lb.parentElement) alvo = lb.parentElement.querySelector('input[type="checkbox"]');
					if (alvo) cbs.push(alvo);
				}
			});
		} catch (e) { return; }

		cbs.forEach(cb => {
			if (cb && cb.type === 'checkbox' && cb.checked) {
				cb.checked = false;
				// notifica via change (NAO usar click: em checkbox o click sintetico re-alterna o estado)
				try { cb.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
				if (!cb.__acCkGridLog) {
					cb.__acCkGridLog = true;
					console.log('[CKGRID] "Atualizar OBS no Grid" desmarcado automaticamente.');
				}
			}
		});
	}

	/* ===== JANELAS AUTOM\u00C1TICAS DO PORTAL =====
	   O portal reabre a janela de "Integra\u00E7\u00F5es / Alertas Cr\u00EDticos" a cada
	   atualiza\u00E7\u00E3o do grid. Fechamos por t\u00EDtulo/URL conhecidos \u2014 nunca por
	   qualquer janela \u2014 e registramos no console o que foi fechado.
	   Para desativar: no console, top.__acFecharJanelas = false           */
	const JANELAS_AUTO_FECHAR = [
		{ nome: 'Integra\u00E7\u00F5es / Alertas Cr\u00EDticos',
		  titulo: /INTEGRA[C\u00C7][O\u00D5]ES\s*\/\s*ALERTAS\s*CR[I\u00CD]TICOS/i,
		  url: /integracoes_gris\.php/i }
	];

	// Impede a janela de nascer: envolve o NewJan do portal em cada frame.
	// Janelas fora da lista continuam abrindo normalmente.
	function interceptarAberturaJanelas(j) {
		try {
			if (typeof j.NewJan !== 'function' || j.NewJan.__acEnvolvido) return;
			const original = j.NewJan;
			const envolvido = function (titulo, url) {
				try {
					if (T.__acFecharJanelas !== false) {
						const t = String(titulo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
						const u = String(url || '');
						if (JANELAS_AUTO_FECHAR.some(cfg => cfg.titulo.test(t) || cfg.url.test(u))) {
							console.log('[CENTRAL] janela autom\u00E1tica barrada antes de abrir:', titulo || url);
							return;
						}
					}
				} catch (e) { }
				return original.apply(this, arguments);
			};
			envolvido.__acEnvolvido = true;
			envolvido.__acOriginal = original;
			j.NewJan = envolvido;
		} catch (e) { }
	}

	// Rede de seguran\u00E7a: se a janela vier por outro caminho, fecha no instante
	// em que ela \u00E9 inserida (sem esperar o la\u00E7o de 700ms).
	function observarJanelas(doc) {
		try {
			if (!doc || !doc.body || doc.__acObsJanelas) return;
			const Obs = doc.defaultView && doc.defaultView.MutationObserver;
			if (!Obs) return;
			doc.__acObsJanelas = new Obs(muts => {
				for (const m of muts) {
					for (const n of m.addedNodes) {
						if (n.nodeType !== 1) continue;
						if ((n.className || '').toString().indexOf('dhxwin') !== -1 ||
							(n.querySelector && n.querySelector('.dhxwin_text_inside'))) {
							fecharJanelasAutomaticas(doc);
							return;
						}
					}
				}
			});
			doc.__acObsJanelas.observe(doc.body, { childList: true, subtree: true });
		} catch (e) { }
	}

	function fecharJanelasAutomaticas(doc) {
		if (T.__acFecharJanelas === false) return;
		let janelas;
		try { janelas = doc.querySelectorAll('div.dhxwin_active, div[class*="dhxwin"]'); }
		catch (e) { return; }
		janelas.forEach(win => {
			try {
				if (win.__acFechada) return;
				const titulo = (win.querySelector('.dhxwin_text_inside')?.textContent || '').replace(/\s+/g, ' ').trim();
				const src = win.querySelector('iframe[src]')?.getAttribute('src') || '';
				const alvo = JANELAS_AUTO_FECHAR.find(j =>
					(titulo && j.titulo.test(titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) ||
					(src && j.url.test(src)));
				if (!alvo) return;

				win.__acFechada = true;
				console.log('[CENTRAL] fechando janela autom\u00E1tica:', titulo || src);

				// 1\u00AA op\u00E7\u00E3o: o pr\u00F3prio bot\u00E3o de fechar do dhtmlx (mant\u00E9m a limpeza interna)
				const btn = win.querySelector('.dhxwin_button_close');
				if (btn) {
					// o dhtmlx costuma reagir ao mousedown; o click cobre outros temas
					let disparou = false;
					['mousedown', 'mouseup'].forEach(tipo => {
						try {
							btn.dispatchEvent(new doc.defaultView.MouseEvent(tipo, { bubbles: true, cancelable: true }));
							disparou = true;
						} catch (e) { }
					});
					if (!disparou) { try { btn.click(); } catch (e) { } }
				}
				// 2\u00AA op\u00E7\u00E3o: se continuar na tela, remove a janela e o overlay
				setTimeout(() => {
					try {
						if (!win.isConnected) return;
						win.remove();
						doc.querySelectorAll('.dhxwin_fr_cover, .dhx_modal_cover_dv').forEach(c => c.remove());
						console.log('[CENTRAL] janela removida (o bot\u00E3o de fechar n\u00E3o respondeu).');
					} catch (e) { }
				}, 600);
			} catch (e) { }
		});
	}

	// varre todos os frames desmarcando o checkbox (chamado num laco rapido)
	function enforcarCkGrid() {
		(function walk(j) {
			try {
				const doc = j.document;
				interceptarAberturaJanelas(j);
				if (doc && doc.body) { desmarcarCkGridDoc(doc); observarJanelas(doc); fecharJanelasAutomaticas(doc); }
				for (let i = 0; i < j.frames.length; i++) walk(j.frames[i]);
			} catch (e) { }
		})(T);
	}

	function instalarCapturaWhatsapp() {
		(function walk(j) {
			try {
				const doc = j.document;
				if (doc && doc.body) {
					if (!doc.__acWppHandler) {
						doc.__acWppHandler = true;
						doc.addEventListener('click', onClickCaptura, true);
					}
					if (!doc.__acMsgHandler) {
						doc.__acMsgHandler = true;
						doc.addEventListener('click', onClickAcionaWpp, true);
					}
					desmarcarCkGridDoc(doc);
				}
				for (let i = 0; i < j.frames.length; i++) walk(j.frames[i]);
			} catch (e) { }
		})(T);
	}

	/* =========================================================
	   0b. REGISTRO "acionado via WhatsApp" AO ESCOLHER MENSAGEM
	   (botoes .btn-opcao-mensagem do modal "Escolha a mensagem")
	   ========================================================= */
	function onClickAcionaWpp(ev) {
		if (T.__acWppOff) return;
		const alvo = ev.target;
		const btn = (alvo && alvo.closest) ? alvo.closest('.btn-opcao-mensagem') : null;
		if (!btn) return;

		const doc = btn.ownerDocument;
		const cdVeiculo = (doc.getElementById('modal_cd_veiculo')?.value || '').trim();
		const nome      = (doc.getElementById('modal_ds_motorista')?.value || '').trim();
		const numero    = (doc.getElementById('modal_numero')?.value || '').replace(/\D/g, '');
		if (!cdVeiculo) return;

		// regra de pernoite por transportadora (Pecal/Rossini/Falleiro), SO com o veiculo parado
		const linhaVe = linhaDoVeiculo(doc, cdVeiculo);
		const cliVe   = linhaVe ? (linhaVe.querySelector('td[data-id="cliente"]')?.textContent.trim() || '') : '';
		const velVe   = velocidadeDaLinha(linhaVe);
		const regra = pernoiteBloqueio(cliVe, velVe);
		if (regra) {
			if (regra.permiteLigar) {
				// Falleiro: pergunta (envio somente em caso de suspeita de sinistro)
				if (!confirm(textoPernoite(regra) +
					'\n\nDeseja realmente enviar a mensagem?')) {
					ev.preventDefault();
					ev.stopImmediatePropagation();
					return;
				}
				// confirmado: deixa o envio seguir e registra a anotacao normalmente
			} else {
				// Pecal/Rossini: bloqueia o envio
				alert(textoPernoite(regra) + '\n\nEnvio de mensagem n\u00E3o permitido neste hor\u00E1rio.');
				ev.preventDefault();
				ev.stopImmediatePropagation();
				return;
			}
		}

		// sem contato do condutor cadastrado: nao registra (nao houve acionamento via WhatsApp)
		if (!numero) {
			console.log('[MSG-WPP] condutor sem telefone cadastrado \u2014 anota\u00E7\u00E3o N\u00C3O registrada.');
			return;
		}

		// evita registro duplicado em cliques repetidos rapidos
		const agora = Date.now();
		if (T.__acMsgUltimo && T.__acMsgUltimo.cd === cdVeiculo && (agora - T.__acMsgUltimo.t) < 2500) return;
		T.__acMsgUltimo = { cd: cdVeiculo, t: agora };

		const texto = nome
			? `Condutor ${nome} acionado via WhatsApp.`
			: 'Condutor acionado via WhatsApp.';

		enviarComentarioVeiculo(texto, cdVeiculo).then(resp => {
			if (resp.indexOf('inserido com sucesso') !== -1) {
				console.log(`[MSG-WPP] anota\u00E7\u00E3o registrada (cd_veiculo=${cdVeiculo}): ${texto}`);
			} else {
				console.warn('[MSG-WPP] resposta inesperada do acao.php:', resp.slice(0, 200));
			}
		}).catch(err => console.error('[MSG-WPP] erro ao registrar:', err));
	}

	/* =========================================================
	   1. JANELA FLUTUANTE (FICHA DE ACIONAMENTO)
	   ========================================================= */
	async function abrirMapaAcionamento(lat, lon, d) {
		fecharModal();

		// pais pela COORDENADA (mais confiavel: o texto do grid nem sempre traz o pais);
		// se a geocodificacao falhar, cai no criterio textual antigo
		const pais = await paisPorCoordenada(lat, lon);
		d.__pais = pais || '';
		const exterior = pais ? (pais !== 'BR') : ehExterior(d.posicao);
		const mid = exterior ? MAP_MID_EXTERIOR : MAP_MID;
		const urlViewer = `https://www.google.com/maps/d/viewer?hl=pt-BR&mid=${mid}&ll=${lat}%2C${lon}&z=${ZOOM}`;
		const urlEmbed  = `https://www.google.com/maps/d/embed?hl=pt-BR&mid=${mid}&ll=${lat}%2C${lon}&z=${ZOOM}`;
		const urlPonto  = `https://www.google.com/maps?q=${lat},${lon}`;

		const rasc = T.__acRascunhos[d.placa] || (T.__acRascunhos[d.placa] = {
			qtd: 1,
			itens: [{ posto: '', telefone: '', anotacao: '', semContato: false }]
		});

		const fichaTexto =
`\u{1F6A8} ACIONAMENTO POLICIAL
\u{1F4CC} Placa: ${d.placa}
\u{1F464} Motorista: ${d.motorista}
\u{1F3E2} Cliente: ${d.cliente}
\u{1F4CD} Origem: ${d.origem}
\u{1F3C1} Destino: ${d.destino}
\u{1F69B} Carretas: ${d.carreta1} / ${d.carreta2}
\u23F0 Data posi\u00E7\u00E3o: ${d.dataHora}
\u{1F680} Velocidade: ${d.velocidade}
\u{1F511} Igni\u00E7\u00E3o: ${d.ignicao}
\u{1F6E1} PGR: ${d.pgr}
\u{1F4CD} Localiza\u00E7\u00E3o: ${d.posicao}
\u{1F310} Coordenadas: ${lat}, ${lon}
${urlPonto}`;

		let opts = '';
		for (let k = 0; k <= MAX_POLICIAS; k++) {
			const rotulo = k === 0 ? '0 (sem postos pr\u00F3ximos)' : String(k);
			opts += `<option value="${k}"${k === rasc.qtd ? ' selected' : ''}>${rotulo}</option>`;
		}

		const modal = D.createElement('div');
		modal.id = 'modal-mapa-acionamento';
		modal.style.cssText =
			'position:fixed;top:2%;left:50%;transform:translateX(-50%);width:1200px;max-width:96vw;' +
			'max-height:96vh;overflow:hidden;background:#fff;z-index:2147483000;' +
			'display:flex;flex-direction:column;' +
			'';
		modal.classList.add('cop-jan');
		estiloJanelas();

		modal.innerHTML = `
			<div id="ac-header" class="cop-jan-head" style="--cop-acento:#b22222;cursor:move;display:flex;align-items:center;gap:8px;user-select:none;">
				<span style="flex:1;">\u{1F6A8} Ficha de Acionamento \u2014 ${d.placa}</span>
				<button id="ac-copiar-ficha" style="background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.5);color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">\u{1F4CB} Ficha</button>
				<a href="${urlViewer}" target="_blank" style="background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.5);color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;text-decoration:none;">Guia \u2197</a>
				<button id="ac-fechar" class="cop-jan-x">\u2716</button>
			</div>
			<div style="padding:10px 15px;background:#f9f9f9;border-bottom:1px solid #ccc;font-size:12px;display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;">
				<div style="grid-column:span 2;">
					<strong>\u{1F4CC} Placa:</strong> <span style="color:#b22222;font-size:15px;font-weight:bold;">${d.placa}</span>
					  <strong>\u{1F310}</strong> ${lat}, ${lon}
					<button id="ac-copiar-coords" style="margin-left:6px;font-size:10px;cursor:pointer;">copiar</button>
				</div>
				<div><strong>\u{1F464} Motorista:</strong> ${d.motorista}</div>
				<div><strong>\u{1F3E2} Cliente:</strong> ${d.cliente}</div>
				<div><strong>\u{1F4CD} Origem:</strong> ${d.origem}</div>
				<div><strong>\u{1F3C1} Destino:</strong> ${d.destino}</div>
				<div><strong>\u{1F69B} Carreta 1:</strong> ${d.carreta1}</div>
				<div><strong>\u{1F69B} Carreta 2:</strong> ${d.carreta2}</div>
				<div><strong>\u23F0 Data Posi\u00E7\u00E3o:</strong> ${d.dataHora}</div>
				<div><strong>\u{1F680} Velocidade:</strong> ${d.velocidade}</div>
				<div><strong>\u{1F511} Igni\u00E7\u00E3o:</strong> ${d.ignicao}</div>
				<div><strong>\u{1F6E1} PGR:</strong> ${d.pgr}</div>
				<div style="grid-column:span 2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><strong>\u{1F4CD} Localiza\u00E7\u00E3o:</strong> ${d.posicao}${d.__pais ? ` <span style="color:#888;">(${d.__pais})</span>` : ''}</div>
			</div>
			<div id="ac-corpo" style="display:flex;align-items:stretch;background:#fff;">
				<div style="position:relative;flex:1;min-width:0;height:420px;background:#eee;">
					<iframe src="${urlEmbed}" style="width:100%;height:100%;border:none;"></iframe>
					<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;font-size:35px;color:red;text-shadow:0 0 3px #fff;">\u2316</div>
				</div>
				<div id="ac-anotacoes" style="display:flex;flex-direction:column;width:370px;height:420px;border-left:1px solid #ccc;background:#f1f1f1;box-sizing:border-box;">
					<div style="padding:8px 10px 4px;">
						<div style="font-weight:bold;font-size:12px;color:#b22222;margin-bottom:6px;">\u{1F4DD} ANOTA\u00C7\u00D5ES DO ACIONAMENTO</div>
						<div style="display:flex;align-items:center;gap:8px;">
							<label for="ac-anot-qtd" style="font-size:11px;font-weight:bold;color:#333;">Quantas pol\u00EDcias acionou?</label>
							<select id="ac-anot-qtd" style="padding:2px 6px;font-size:12px;">${opts}</select>
						</div>
					</div>
					<div id="ac-anot-lista" style="flex:1;overflow-y:auto;padding:6px 10px;"></div>
					<div style="padding:8px 10px;border-top:1px solid #ddd;background:#eaeaea;display:flex;align-items:center;gap:8px;">
						<button id="ac-anot-registrar" style="background:#2e7d32;color:#fff;border:0;border-radius:4px;padding:6px 14px;font:bold 11px 'Segoe UI',Arial,sans-serif;cursor:pointer;">\u{1F4BE} REGISTRAR ANOTA\u00C7\u00D5ES</button>
					</div>
				</div>
			</div>`;

		D.body.appendChild(modal);

		D.getElementById('ac-fechar').onclick = fecharModal;
		D.getElementById('ac-copiar-ficha').onclick  = function () { copiar(fichaTexto, this, '\u{1F4CB} Ficha'); };
		D.getElementById('ac-copiar-coords').onclick = function () { copiar(lat + ', ' + lon, this, 'copiar'); };
		D.addEventListener('keydown', escFechar, true);

		renderAnotacoes();

		D.getElementById('ac-anot-qtd').onchange = function () {
			rasc.qtd = parseInt(this.value, 10) || 0;
			renderAnotacoes();
		};

		D.getElementById('ac-anot-registrar').onclick = registrarAnotacoes;

		function renderAnotacoes() {
			const cont = D.getElementById('ac-anot-lista');
			if (!cont) return;

			while (rasc.itens.length < rasc.qtd) {
				rasc.itens.push({ posto: '', telefone: '', anotacao: '', semContato: false });
			}

			cont.innerHTML = '';

			if (rasc.qtd === 0) {
				const aviso = D.createElement('div');
				aviso.style.cssText = 'border:1px solid #e0c36b;background:#fff8e1;color:#7a5c00;border-radius:6px;padding:10px;font-size:12px;';
				aviso.innerHTML = `
					<div style="font-weight:bold;margin-bottom:4px;">\u26A0\uFE0F Nenhum posto policial pr\u00F3ximo</div>
					<div style="margin-bottom:8px;">O registro ser\u00E1 feito automaticamente informando que n\u00E3o havia postos policiais pr\u00F3ximos \u00E0 posi\u00E7\u00E3o do ve\u00EDculo.</div>`;
				cont.appendChild(aviso);
				return;
			}

			rasc.itens.slice(0, rasc.qtd).forEach((item, i) => {
				const bloco = D.createElement('div');
				bloco.style.cssText = 'border:1px solid #ddd;border-radius:6px;padding:8px;margin-bottom:8px;background:#fff;';
				bloco.innerHTML = `
					<div style="font-weight:bold;color:#b22222;font-size:11px;margin-bottom:5px;">POSTO POLICIAL ${i + 1}</div>
					<input type="text" data-campo="posto" data-i="${i}"
						placeholder="Nome do posto (ex.: BPM Fronteira)"
						value="${escAttr(item.posto)}"
						style="width:100%;box-sizing:border-box;padding:5px 7px;border:1px solid #ccc;border-radius:4px;font-size:12px;margin-bottom:5px;">
					<div style="display:flex; gap:5px; margin-bottom:5px;">
						<input type="text" data-campo="telefone" data-i="${i}"
							placeholder="Telefone (ex.: 190 ou 4934441234)"
							value="${escAttr(item.telefone)}"
							style="flex:1; box-sizing:border-box; padding:5px 7px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
						<button data-btn="ligar-input" data-i="${i}" title="Ligar para o n\u00FAmero preenchido" style="background:#4CAF50; color:white; border:none; border-radius:4px; padding:0 8px; cursor:pointer; font-size:12px;">\u{1F4DE} Ligar</button>
					</div>
					<label style="display:flex;align-items:center;gap:5px;font-size:11px;color:#555;margin-bottom:5px;cursor:pointer;">
						<input type="checkbox" data-campo="semContato" data-i="${i}" ${item.semContato ? 'checked' : ''}>
						N\u00E3o consegui contato com este posto
					</label>
					<textarea data-campo="anotacao" data-i="${i}" rows="2"
						placeholder="${item.semContato ? 'Registrar\u00E1 tentativa sem sucesso (padr\u00E3o).' : 'Qual informa\u00E7\u00E3o conseguiu?'}"
						${item.semContato ? 'disabled' : ''}
						style="width:100%;box-sizing:border-box;padding:5px 7px;border:1px solid #ccc;border-radius:4px;font-size:12px;resize:vertical;${item.semContato ? 'background:#e6e6e6;color:#999;' : ''}">${escHtml(item.anotacao)}</textarea>`;
				cont.appendChild(bloco);
			});

			cont.querySelectorAll('[data-campo]').forEach(el => {
				const i = parseInt(el.dataset.i, 10);
				const campo = el.dataset.campo;
				if (campo === 'semContato') {
					el.onchange = () => {
						rasc.itens[i].semContato = el.checked;
						renderAnotacoes();
					};
				} else {
					el.oninput = () => { rasc.itens[i][campo] = el.value; };
				}
			});

			cont.querySelectorAll('[data-btn="ligar-input"]').forEach(btn => {
				btn.onclick = () => {
					const i = btn.dataset.i;
					const tel = rasc.itens[i].telefone;
					const sipLink = formatarSip(tel);

					if (!sipLink) {
						alert('Por favor, digite um n\u00FAmero de telefone v\u00E1lido no campo antes de clicar em Ligar.');
						return;
					}

					const link = D.createElement('a');
					link.href = sipLink;
					link.click();
				};
			});
		}

		async function registrarAnotacoes() {
			if (rasc.qtd === 0) {
				if (!confirm('Confirmar o registro informando que N\u00C3O h\u00E1 postos policiais pr\u00F3ximos?')) return;
			} else {
				for (let i = 0; i < rasc.qtd; i++) {
					const it = rasc.itens[i];
					if (!it.posto.trim()) {
						alert('Informe o nome do posto policial ' + (i + 1) + '.');
						return;
					}
					if (!it.telefone.trim()) {
						alert('Informe o telefone do posto policial ' + (i + 1) + '.');
						return;
					}
					if (!it.semContato && !it.anotacao.trim()) {
						alert('Preencha a anota\u00E7\u00E3o do posto ' + (i + 1) + ' (ou marque "N\u00E3o consegui contato").');
						return;
					}
				}
			}

			const btnReg = D.getElementById('ac-anot-registrar');
			btnReg.disabled = true;
			btnReg.innerText = 'ENVIANDO...';
			btnReg.style.opacity = '0.7';

			const promises = [];
			const obsRegistradas = [];

			if (rasc.qtd === 0) {
				const obs = "ACIONAMENTO POLICIAL: Nenhum posto policial pr\u00F3ximo \u00E0 posi\u00E7\u00E3o.";
				obsRegistradas.push(obs);
				promises.push(enviarComentarioVeiculo(obs, d.cd_veiculo));
			} else {
				for (let i = 0; i < rasc.qtd; i++) {
					const it = rasc.itens[i];
					let obs = '';
					if (it.semContato) {
						obs = `TENTATIVA DE ACIONAMENTO POLICIAL PARA ${it.posto.trim().toUpperCase()} ${it.telefone.trim()} sem sucesso.`;
					} else {
						obs = `ACIONAMENTO POLICIAL PARA ${it.posto.trim().toUpperCase()} ${it.telefone.trim()}. Anota\u00E7\u00E3o: ${it.anotacao.trim()}`;
					}
					obsRegistradas.push(obs);
					promises.push(enviarComentarioVeiculo(obs, d.cd_veiculo));
				}
			}

			try {
				await Promise.all(promises);
				// memoria de sessao: resultado do acionamento desta placa (usado no informativo do Formalizar)
				try {
					const sess = sessTrat(d.cd_veiculo);
					sess.acionamentos = obsRegistradas.slice();
					// resultado para o passo de acionamento ser dado sozinho:
					//   'sucesso'  -> algum posto acionado com contato   -> passo SIM
					//   'sem-sucesso' -> tentou em todos, sem contato    -> passo N\u00C3O
					//   'sem-postos'  -> nenhum posto pr\u00F3ximo             -> passo N\u00C3O
					const comContato = rasc.qtd > 0 &&
						rasc.itens.slice(0, rasc.qtd).some(it => !it.semContato && it.anotacao.trim());
					sess.resultadoAcion = (rasc.qtd === 0) ? 'sem-postos'
						: (comContato ? 'sucesso' : 'sem-sucesso');
					sess.acionSucessos = rasc.qtd > 0
						? rasc.itens.slice(0, rasc.qtd).filter(it => !it.semContato && it.anotacao.trim())
							.map(it => `${it.posto.trim().toUpperCase()} ${it.telefone.trim()}: ${it.anotacao.trim()}`)
						: [];
				} catch (e) {}
				console.log('[ACIONAMENTO] Anota\u00E7\u00F5es inseridas com sucesso no sistema (ISO-8859-1).');
				alert('Anota\u00E7\u00F5es registradas com sucesso no sistema! \u2714');
				fecharModal();
				delete T.__acRascunhos[d.placa];
			} catch (error) {
				console.error('[ACIONAMENTO] Erro no envio:', error);
				alert('Falha ao registrar uma ou mais anota\u00E7\u00F5es. Verifique a conex\u00E3o ou tente novamente.');
			} finally {
				btnReg.disabled = false;
				btnReg.innerText = '\u{1F4BE} REGISTRAR ANOTA\u00C7\u00D5ES';
				btnReg.style.opacity = '1';
			}
		}

		/* ---------- arraste pelo cabecalho ---------- */
		const header = D.getElementById('ac-header');
		header.onmousedown = (e) => {
			if (e.target.closest('button,a')) return;
			const shiftX = e.clientX - modal.getBoundingClientRect().left;
			const shiftY = e.clientY - modal.getBoundingClientRect().top;
			const move = ev => {
				modal.style.left = (ev.pageX - shiftX) + 'px';
				modal.style.top  = (ev.pageY - shiftY) + 'px';
				modal.style.transform = 'none';
			};
			const up = () => {
				D.removeEventListener('mousemove', move);
				D.removeEventListener('mouseup', up);
			};
			D.addEventListener('mousemove', move);
			D.addEventListener('mouseup', up);
			e.preventDefault();
		};
	}

	/* =========================================================
	   2. LINHA SELECIONADA + EXTRACAO DOS DADOS (data-id)
	   ========================================================= */
	function acharLinhaSelecionada() {
		let linha = null;
		(function varrer(j) {
			try {
				if (!linha) {
					const e = j.document.querySelector('tr.selecionado, tr.selected');
					if (e) linha = e;
				}
				for (let i = 0; i < j.frames.length; i++) varrer(j.frames[i]);
			} catch (e) { /* frame inacessivel: ignora */ }
		})(T);
		return linha;
	}

	function extrairDadosDaLinhaSelecionada() {
		const tr = acharLinhaSelecionada();
		if (!tr) return null;

		const getVal = id => tr.querySelector(`td[data-id="${id}"]`)?.innerText.trim() || 'N\u00E3o informado';
		const tdLoc  = tr.querySelector('td[data-id="localizacao"]');

		return {
			cd_veiculo: (tdLoc?.id || '').replace('ds_posicao_', ''),
			cd_clifor : tr.querySelector('td[data-id="id"]')?.innerText.trim() || '',
			cd_proprietario: extrairProprietario(tr),
			posicao   : getVal('localizacao'),
			placa     : (tr.querySelector('td[data-id="veiculo"]')?.innerText.trim() || 'N/D').split('\n')[0],
			motorista : getVal('motorista'),
			cliente   : getVal('cliente'),
			origem    : getVal('origem'),
			destino   : getVal('destino'),
			carreta1  : getVal('carreta1'),
			carreta2  : getVal('carreta2'),
			dataHora  : getVal('data'),
			velocidade: getVal('vel') + ' km/h',
			ignicao   : tr.querySelector('td[data-id="ig"] img')?.title || 'N/D',
			pgr       : getVal('pgr')
		};
	}

	function extrairContato(tr) {
		let nome = '', numero = '';
		if (tr) {
			// pega o onclick com abrirModalMensagem: getAttribute devolve o valor
			// decodificado (aspas literais); outerHTML traria &quot; e quebraria a regex
			let on = '';
			const el = tr.querySelector('[onclick*="abrirModalMensagem"]');
			if (el) on = el.getAttribute('onclick') || '';
			if (!on) {
				on = (tr.outerHTML || '')
					.replace(/&quot;/g, '"')
					.replace(/&#0*34;/g, '"')
					.replace(/&amp;/g, '&');
			}

			const mm = on.match(
				/abrirModalMensagem\(\s*\d+\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"/i
			);
			if (mm) {
				nome   = (mm[2] || '').trim();
				// SO o telefone do condutor (campo "numero"); nao usa numero2 (telefone do veiculo)
				numero = adicionarNoveSeCelularBR((mm[3] || '').trim());
			}
			if (!nome) {
				const tdMot = tr.querySelector('td[data-id="motorista"]');
				if (tdMot) nome = (tdMot.textContent || '').replace(/\s+/g, ' ').trim();
			}
		}
		return { nome: nome, numero: numero };
	}

	/* =========================================================
	   3. BUSCA DAS COORDENADAS NO mapapa.php (setView do Leaflet)
	   ========================================================= */
	async function buscarCoordenadas(dados, btn) {
		if (!dados.cd_veiculo) {
			alert('N\u00E3o consegui identificar o cd_veiculo da linha (td[data-id="localizacao"] sem id ds_posicao_...).');
			return;
		}

		const original = btn.innerHTML;
		btn.innerHTML = '\u23F3 Buscando posi\u00E7\u00E3o...';
		btn.disabled = true;

		const url = `${URL_MAPA}?equip=1&cd_veiculo=${encodeURIComponent(dados.cd_veiculo)}` +
			`&cd_clifor=${encodeURIComponent(dados.cd_clifor)}` +
			`&posicao=${encodeURIComponent(dados.posicao)}&dhxr${Date.now()}=1`;

		try {
			const res = await fetch(url, { credentials: 'include' });
			const txt = await res.text();

			const m = txt.match(/setView\(\s*\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/i)
			       || txt.match(/\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/);

			if (m && ehLat(parseFloat(m[1])) && ehLng(parseFloat(m[2]))) {
				console.log('[ACIONAMENTO]', dados.placa, '\u2192', m[1] + ', ' + m[2]);
				abrirMapaAcionamento(m[1], m[2], dados);
			} else {
				console.warn('[ACIONAMENTO] retorno do mapapa.php sem coordenadas v\u00E1lidas (cd_veiculo=' +
					dados.cd_veiculo + '). In\u00EDcio da resposta:', txt.slice(0, 400));
				alert('Coordenadas n\u00E3o encontradas para ' + dados.placa + '.\nVeja o console (F12) para o retorno do servidor.');
			}
		} catch (e) {
			console.error('[ACIONAMENTO] erro no fetch:', e);
			alert('Erro de conex\u00E3o ao buscar a posi\u00E7\u00E3o.');
		} finally {
			btn.innerHTML = original;
			btn.disabled = false;
		}
	}

	/* =========================================================
	   3b. ALERTAS DO VEICULO (atuacao/lista.php)
	   ========================================================= */
	async function buscarAlertas(cdVeiculo, cdProprietario) {
		const url = `${URL_ALERTAS}?tabela=0&cd_veiculo=${encodeURIComponent(cdVeiculo)}&cd_proprietario=${encodeURIComponent(cdProprietario)}`;
		const res = await fetch(url, {
			headers: {
				"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
				"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
				"upgrade-insecure-requests": "1"
			},
			method: "GET",
			mode: "cors",
			credentials: "include"
		});
		const buf = await res.arrayBuffer();
		const txt = new TextDecoder('windows-1252').decode(buf);
		return parsearAlertas(txt);
	}

	function parsearAlertas(html) {
		const doc = new DOMParser().parseFromString(html, 'text/html');
		const ths = Array.from(doc.querySelectorAll('th')).map(th => (th.textContent || '').trim().toLowerCase());
		const idx = (busca, padrao) => {
			const i = ths.findIndex(t => t.includes(busca));
			return i >= 0 ? i : padrao;
		};
		const idxGeracao = idx('gera', 1);
		const idxAlerta  = idx('alerta', 3);
		const idxStatus  = idx('status', 4);

		const alertas = [];
		doc.querySelectorAll('tr').forEach(tr => {
			const tds = tr.querySelectorAll('td');
			if (!tds.length) return; 

			const pega = i => (tds[i] ? (tds[i].textContent || '').replace(/\s+/g, ' ').trim() : '');
			const alerta = pega(idxAlerta);
			if (!alerta) return;

			const onclick = tr.getAttribute('onclick') || '';
			const m = onclick.match(/clica\(this,\s*'([^']*)',\s*'([^']*)',\s*'([^']*)'/);

			alertas.push({
				alerta:      alerta,
				status:      pega(idxStatus),
				geracao:     pega(idxGeracao),
				cd_atua:     m ? m[1] : '',
				cd_processo: m ? m[2] : ''
			});
		});
		return alertas;
	}

	/* =========================================================
	   3c-bis. MOTOR DE TRATAMENTO DE PASSO (tratar_passo + acoes_ajax)
	   ========================================================= */
	// interpreta o HTML do tratar_passo.php
	function parsePassoTratamento(html) {
		const val = (id) => {
			const m = html.match(new RegExp('<input[^>]*id=["\']' + id + '["\'][^>]*value=["\']([^"\']*)["\']', 'i'));
			return m ? m[1] : '';
		};
		const mo = html.match(/<textarea[^>]*id=["']ds_obs["'][^>]*>([\s\S]*?)<\/textarea>/i);
		const opcoes = [];
		const reR = /<input[^>]*name=['"]tipo['"][^>]*value=['"]([^'"]+)['"][^>]*>\s*<label[^>]*>([^<]*)<\/label>/gi;
		let mm;
		while ((mm = reR.exec(html)) !== null) opcoes.push({ valor: mm[1], rotulo: mm[2].trim() });

		return {
			cd_atua:    val('cd_atua'),
			acao:       val('acao'),        // = cd_ordem
			cd_veiculo: val('cd_veiculo'),
			cd_clifor:  val('cd_clifor'),
			ds_obs:     mo ? mo[1].trim() : '',
			opcoes:     opcoes,             // [{valor:'1',rotulo:'SIM'},{valor:'2',rotulo:'NÃO'}]
			nome:       (html.match(/NOME:\s*<b>([^<]*)<\/b>/i) || [])[1] || '',
			contato:    (html.match(/CONTATO:\s*<b>([^<]*)<\/b>/i) || [])[1] || ''
		};
	}

	// busca a tela do passo atual da ocorrencia
	async function buscarPassoTratamento(acao, cdAtua, cdClifor, cdVeiculo, cdMotorista) {
		const url = `${URL_TRATAR_PASSO}?acao=${encodeURIComponent(acao)}&cd_atua=${encodeURIComponent(cdAtua)}` +
			`&cd_clifor=${encodeURIComponent(cdClifor)}&cd_veiculo=${encodeURIComponent(cdVeiculo)}` +
			`&cd_motorista=${encodeURIComponent(cdMotorista || '0')}`;
		const res = await fetch(url, {
			headers: {
				"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
				"upgrade-insecure-requests": "1"
			},
			method: "GET",
			mode: "cors",
			credentials: "include"
		});
		const buf = await res.arrayBuffer();
		const txt = new TextDecoder('windows-1252').decode(buf);
		return parsePassoTratamento(txt);
	}

	// registra o passo (sucesso ou nao). cd_grid=0 (nao atualiza OBS no grid).
	// mesma logica do Acao() do sistema: ds_obs sem aspas e com no minimo 10 caracteres.
	async function registrarPasso(cdAtua, cdSucesso, cdOrdem, dsObs, cdVeiculo) {
		let obs = String(dsObs || '').replace(/['"]/g, '').trim();
		if (obs.length < 10) throw new Error('A observa\u00E7\u00E3o precisa ter pelo menos 10 caracteres.');
		// sistema em latin1: usa escape() (ex.: "á" -> %E1). '+' escapado explicitamente.
		const obsEnc = escape(obs).replace(/\+/g, '%2B');
		const url = `${URL_ACOES_AJAX}?tp=atualizar_sucesso_atuacao&cd_atua=${encodeURIComponent(cdAtua)}` +
			`&cd_grid=0&cd_sucesso=${encodeURIComponent(cdSucesso)}&cd_ordem=${encodeURIComponent(cdOrdem)}` +
			`&ds_obs=${obsEnc}&cd_veiculo=${encodeURIComponent(cdVeiculo)}`;
		const res = await fetch(url, {
			headers: {
				"accept": "*/*",
				"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
			},
			method: "POST",
			mode: "cors",
			credentials: "include"
		});
		return res.text(); // vem em branco quando da certo
	}

	// reagenda/finaliza a ocorrencia (ultimo passo). Resposta so fecha a janela.
	// dt_reag no formato "DD/MM/YYYY HH:MM" (o sistema encoda apenas o espaco como %20).
	async function reagendarOcorrencia(cdAtua, cdEvento, cdVeiculo, dtReag) {
		const dt = String(dtReag || '').replace(/ /g, '%20');
		const url = `${URL_ACAO_ATUACAO}?tp=J&cd_atua=${encodeURIComponent(cdAtua)}&cd_evento=${encodeURIComponent(cdEvento)}` +
			`&ds_just=&ds_just1=&cd_veiculo=${encodeURIComponent(cdVeiculo)}&dt_reag=${dt}`;
		const res = await fetch(url, {
			headers: {
				"accept": "*/*",
				"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
			},
			method: "POST",
			mode: "cors",
			credentials: "include"
		});
		return res.text();
	}

	// gera o texto do informativo.
	// anotacoesCustom (opcional): substitui a OBS pelo bloco de anotacoes
	// (formato do passo Formalizar: ocorrencias, linha em branco, anotacoes, corpo).
	/* Negrito do WhatsApp (*texto*) nas informa\u00E7\u00F5es que o cliente precisa ver
	   de imediato. N\u00E3o marca linha vazia nem linha j\u00E1 marcada.              */
	const INFORMATIVO_NEGRITO = /^(Placa|Motorista|Data\/Hora|Local|Igni\u00E7\u00E3o|\u00DAltima Macro)\s*:/i;
	function aplicarNegritoInformativo(texto) {
		return String(texto || '').split('\n').map(linha => {
			const t = linha.trim();
			if (!t || /^\*.*\*$/.test(t)) return linha;      // vazia ou j\u00E1 em negrito
			if (!INFORMATIVO_NEGRITO.test(t)) return linha;
			if (/^Link Google/i.test(t)) return linha;        // URL n\u00E3o entra em negrito
			return `*${t}*`;
		}).join('\n');
	}

	async function gerarTextoInformativo(dados, anotacoesCustom, modoFormalizar) {
		const alertas = await buscarAlertas(dados.cd_veiculo, dados.cd_clifor);
		const nomes = [];
		alertas.forEach(a => {
			if (a.alerta && !ehOcorrenciaOculta(a.alerta) && nomes.indexOf(a.alerta) === -1) nomes.push(a.alerta);
		});
		const ocorrenciasHeader = nomes.length > 0 ? `*${nomes.join(', ')}*\n` : '';

		const urlMapapa = `${URL_MAPA}?equip=1&risco=1&liberado=1&trajeto=1&desloc=1&posicionamento=0&clifor_clifor=0&postos=0&postosrota=0&riscorota=0&liberadorota=0&paradas=1&cd_veiculo=${encodeURIComponent(dados.cd_veiculo)}&cd_clifor=${encodeURIComponent(dados.cd_clifor)}&posicao=${encodeURIComponent(dados.posicao)}&dhxr${Date.now()}=1`;

		const res = await fetch(urlMapapa, {
			headers: {
				"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
				"upgrade-insecure-requests": "1"
			},
			method: "GET",
			mode: "cors",
			credentials: "include"
		});

		const buf = await res.arrayBuffer();
		const txt = new TextDecoder('windows-1252').decode(buf);

		const bodyMatch = txt.match(/(<b>Motorista:[\s\S]*?<b>Rota:.*?<\/b>)/i);
		if (!bodyMatch) throw new Error('N\u00E3o foi poss\u00EDvel extrair os dados da ficha. Tente recarregar a tela.');
		const bodyText = stripHtmlAndPreserveNewlines(bodyMatch[1]);

		// modo Formalizar: ocorrencias + anotacoes (se houver) + linha em branco + corpo.
		// SEM anotacoes (ex.: ocorrencia sem passo de contato), NAO usa a OBS da placa.
		if (modoFormalizar || (anotacoesCustom && String(anotacoesCustom).trim())) {
			const temAnot = anotacoesCustom && String(anotacoesCustom).trim();
			const anot = temAnot ? (String(anotacoesCustom).replace(/\n+$/, '') + '\n') : '';
			const cab = (ocorrenciasHeader + anot).replace(/\n+$/, '');
			return aplicarNegritoInformativo((cab ? cab + '\n\n' : '') + bodyText);
		}

		const obsMatch = txt.match(/<b>OBS:\s*<\/b>(.*?)<\/div>/i);
		let obsText = '';
		if (obsMatch) {
			let obsConteudo = stripHtmlAndPreserveNewlines(obsMatch[1]);
			obsConteudo = obsConteudo
				.replace(/\s*-\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?\s*$/, '')
				.replace(/\s+$/, '');
			obsText = obsConteudo + '\n';
		}

		let statusContato = '';
		const motoLinha = txt.match(/<b>Motorista:\s*<\/b>([\s\S]*?)<br\s*\/?>/i);
		if (motoLinha) {
			const partes = stripHtmlAndPreserveNewlines(motoLinha[1]).split('|').map(s => s.trim());
			const nomeCard = partes[0] || '';
			const telCard  = (partes[2] || '').replace(/\D/g, '');
			if (!nomeCard) statusContato = 'Ve\u00EDculo sem condutor cadastrado.\n';
			else if (!telCard) statusContato = 'Condutor sem n\u00FAmero de telefone cadastrado.\n';
		}

		// sem condutor / sem telefone: se o operador registrou alguma informa\u00E7\u00E3o
		// relevante na placa (ex.: "VERIFICADO NAS CAMERAS, TUDO EM ORDEM..."),
		// ela vale mais que a linha autom\u00E1tica de status.
		let anotRelevante = '';
		if (statusContato) {
			try {
				const itens = await buscarAnotacoesVeiculo(dados.cd_veiculo);
				for (const it of itens) {
					if (!it.ts || (Date.now() - it.ts) > INFORMATIVO_ANOT_MS) continue;
					if (ehAnotStatusAuto(it.texto)) continue;
					anotRelevante = limpaAnot(it.texto);
					if (anotRelevante) break;
				}
			} catch (e) { console.warn('[INFORMATIVO] anota\u00E7\u00F5es indispon\u00EDveis:', e); }
		}

		// prioridade do descritivo: anota\u00E7\u00E3o relevante -> OBS da placa -> status do cadastro
		const descritivo = (ocorrenciasHeader +
			(anotRelevante ? anotRelevante + '\n' : (obsText || statusContato))
		).replace(/\n+$/, '');
		return aplicarNegritoInformativo((descritivo ? descritivo + '\n\n' : '') + bodyText);
	}

	/* =========================================================
	   3c-ter. ANOTACOES DA PLACA (comentarios/lista.php)
	   ========================================================= */
	// memoria de sessao do tratamento, por veiculo (contato e acionamentos feitos pelo painel)
	function sessTrat(cdVeiculo) {
		T.__acSessaoTrat = T.__acSessaoTrat || {};
		const s = (T.__acSessaoTrat[cdVeiculo] = T.__acSessaoTrat[cdVeiculo] || { contato: '', contatoFrota: [], acionamentos: [] });
		if (!s.contatoFrota) s.contatoFrota = []; // compat com sessoes criadas antes
		return s;
	}

	// busca as anotacoes do veiculo; retorna [{texto, quem, ts}] (mais recente primeiro)
	// layout do comentarios/lista.php: <tr><td>Data</td><td>Quem</td><td class='comentarioCopiavel'>Comentario</td></tr>
	async function buscarAnotacoesVeiculo(cdVeiculo) {
		const url = `${URL_COMENT_LISTA}?cd_veiculo=${encodeURIComponent(cdVeiculo)}`;
		const res = await fetch(url, {
			headers: {
				"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
				"upgrade-insecure-requests": "1"
			},
			method: "GET",
			mode: "cors",
			credentials: "include"
		});
		const buf = await res.arrayBuffer();
		const html = new TextDecoder('windows-1252').decode(buf);

		const itens = [];
		try {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			doc.querySelectorAll('tr').forEach(tr => {
				const tds = Array.from(tr.querySelectorAll('td'));
				if (!tds.length) return;

				// comentario: celula .comentarioCopiavel (layout real); fallback: celula mais longa
				let tdCom = tr.querySelector('td.comentarioCopiavel');
				let texto = tdCom ? (tdCom.textContent || '').replace(/\s+/g, ' ').trim() : '';
				if (!tdCom) {
					tds.forEach(td => {
						const t = (td.textContent || '').replace(/\s+/g, ' ').trim();
						if (t.length > texto.length) texto = t;
					});
				}
				if (!texto || texto.length < 5) return;

				const quem = tds[1] ? (tds[1].textContent || '').replace(/\s+/g, ' ').trim() : '';

				// timestamp: data da 1a coluna (fallback: maior data da linha)
				let ts = 0;
				const reDt = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/g;
				const fonteDt = (tds[0] ? tds[0].textContent : '') + ' ' + texto;
				let md;
				while ((md = reDt.exec(fonteDt)) !== null) {
					const t = new Date(+md[3], +md[2] - 1, +md[1], +md[4], +md[5], +(md[6] || 0)).getTime();
					if (t > ts) ts = t;
				}
				itens.push({ texto: texto, quem: quem, ts: ts });
			});
		} catch (e) {}

		itens.sort((a, b) => b.ts - a.ts);
		return itens;
	}

	// tira a data do fim da anotacao e normaliza os espacos
	function limpaAnot(s) {
		return String(s || '')
			.replace(/\s*-\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?\s*$/, '')
			.replace(/\s+/g, ' ').trim();
	}

	// anotacoes que apenas repetem o status do cadastro (ou o aviso de grupo):
	// nao servem como "informacao relevante" no informativo
	function ehAnotStatusAuto(txt) {
		const s = String(txt || '');
		return /sem condutor (vinculado|cadastrado)/i.test(s)
			|| /condutor sem n[u\u00FA]mero/i.test(s)
			|| /sem contato do condutor cadastrado/i.test(s)
			|| /ve[i\u00ED]culo sem condutor/i.test(s)
			|| /informado via grupo/i.test(s);
	}

	// classifica anotacoes de acionamento policial: 'sucesso' | 'nenhum' | 'tentativa' | null
	function classificarAcionamento(txt) {
		const s = String(txt || '');
		const policial = /(ACIONAMENTO POLICIAL|PRF\b|POLICIA|POL\u00CDCIA|DELEGACIA|BPM\b|BATALH)/i.test(s);
		if (!policial) return null;
		if (/nenhum posto/i.test(s)) return 'nenhum';
		if (/sem sucesso/i.test(s)) return 'tentativa';
		if (/^ACIONAMENTO POLICIAL PARA/i.test(s)) return 'sucesso';
		return null;
	}

	// anotacao de contato com o condutor (exclui informado via grupo e acionamentos policiais)
	function ehAnotContato(txt) {
		const s = String(txt || '');
		if (/informado via grupo/i.test(s)) return false;
		if (/contato com [oa] frota/i.test(s)) return false; // frota tem bloco proprio
		if (classificarAcionamento(s)) return false;
		return /tentativas?\s+de\s+(contato|ctt)/i.test(s)
			|| /\bctt\b[\s\S]*sem sucesso/i.test(s)
			|| /^\s*sem contato do condutor/i.test(s)
			|| /^\s*sem condutor vinculado/i.test(s)
			|| /acionado via whatsapp/i.test(s)
			|| /mensagem enviada via whatsapp/i.test(s)
			|| /contato realizado com o condutor/i.test(s);
	}

	// monta o bloco de anotacoes do passo Formalizar.
	// CONTATO: memoria de sessao; senao, anotacao RECENTE (ate 2h) da placa.
	// ACIONAMENTO: SOMENTE memoria de sessao (o que o proprio operador registrou
	// pelo modal nesta sessao) - anotacoes antigas/de terceiros NAO geram a linha.
	async function montarAnotacoesFormalizar(cdVeiculo, permitirContato) {
		// placa cujo plano NAO tem passos de contato/transportadora/policia:
		// informativo sai so com a ocorrencia + ficha (sem anotacoes e sem OBS)
		if (permitirContato === false) return '';
		const limpaData = s => String(s || '')
			.replace(/\s*-\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?\s*$/, '')
			.replace(/\s+/g, ' ').trim();

		const sess = sessTrat(cdVeiculo);

		// anotacoes da placa: busca preguicosa (so quando algum fallback precisar)
		let itensCache = null;
		const getItens = async () => {
			if (itensCache === null) {
				try { itensCache = await buscarAnotacoesVeiculo(cdVeiculo); }
				catch (e) { console.warn('[INFORMATIVO] anotacoes indisponiveis:', e); itensCache = []; }
			}
			return itensCache;
		};

		const RECENTE_MS = 2 * 60 * 60 * 1000;

		// --- contato com o CONDUTOR: UMA linha so. Candidatas = sessao + anotacoes
		//     recentes reconhecidas (ate 2h); a anotacao COMPLETA ("Tentativas de
		//     contato ... sem sucesso.") vence as parciais do WhatsApp ("Mensagem
		//     enviada ... sem retorno." / "acionado via WhatsApp").
		const prioridadeContato = (txt) => {
			const s = String(txt || '');
			if (/tentativas?\s+de\s+(contato|ctt)/i.test(s) && /sem sucesso/i.test(s)) return 0;
			if (/contato realizado com o condutor/i.test(s)) return 1;
			if (/mensagem enviada via whatsapp/i.test(s)) return 3;
			if (/acionado via whatsapp/i.test(s)) return 4;
			return 2;
		};
		const candidatas = [];
		if (sess.contato) candidatas.push({ texto: sess.contato, ts: Date.now() });
		for (const it of await getItens()) {
			if (!it.ts || (Date.now() - it.ts) > RECENTE_MS) continue;
			if (ehAnotContato(it.texto)) candidatas.push({ texto: it.texto, ts: it.ts });
		}
		candidatas.sort((a, b) =>
			(prioridadeContato(a.texto) - prioridadeContato(b.texto)) || (b.ts - a.ts));
		const contato = candidatas.length ? limpaData(candidatas[0].texto) : '';

		// --- contato com a TRANSPORTADORA (frotas): sessao primeiro;
		//     senao TODAS as anotacoes de frota recentes (ate 2h), em ordem cronologica ---
		let linhasFrota = sess.contatoFrota.length ? sess.contatoFrota.map(limpaData) : [];
		if (!linhasFrota.length) {
			const acum = [];
			for (const it of await getItens()) {
				if (!it.ts || (Date.now() - it.ts) > RECENTE_MS) continue;
				if (/contato com [oa] frota/i.test(it.texto)) acum.push(limpaData(it.texto));
			}
			linhasFrota = acum.reverse(); // a lista vem da mais recente p/ a mais antiga
		}

		// --- acionamento policial: SEMPRE generico, sem nomes de postos.
		//     Linha SOMENTE quando o operador acionou nesta sessao e nenhum
		//     posto atendeu; com sucesso ou "nenhum posto proximo": nada. ---
		const L_TENT = 'Tentativas de contato com postos policiais sem sucesso.';
		const linhasAcion = [];
		if (sess.acionamentos.length) {
			const teveSucesso   = sess.acionamentos.some(a => classificarAcionamento(a) === 'sucesso');
			const teveTentativa = sess.acionamentos.some(a => classificarAcionamento(a) === 'tentativa');
			if (!teveSucesso && teveTentativa) linhasAcion.push(L_TENT);
		}

		let bloco = '';
		if (contato) bloco += contato + '\n';
		linhasFrota.forEach(l => { bloco += l + '\n'; });
		linhasAcion.forEach(l => { bloco += l + '\n'; });
		return bloco.replace(/\n+$/, '');
	}

	/* =========================================================
	   3e. ALERTAS DE SENSORES (alertas/lista.php + detalhes.php)
	   ========================================================= */
	function fmtDataBR(d) {
		const p = n => String(n).padStart(2, '0');
		return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
	}
	function parseDataBR(s) {
		const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
		if (!m) return null;
		return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));
	}

	// lista de eventos do periodo: [{cdEvt, dt, ts}] (mais antigo primeiro)
	async function buscarEventosSensores(cdVeiculo, dtIni, dtFim) {
		const url = `${URL_SENS_LISTA}?cd_veiculo=${encodeURIComponent(cdVeiculo)}` +
			`&dt_ini=${String(dtIni).replace(/ /g, '%20')}&dt_fim=${String(dtFim).replace(/ /g, '%20')}`;
		const res = await fetch(url, {
			headers: {
				"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
				"upgrade-insecure-requests": "1"
			},
			method: "GET", mode: "cors", credentials: "include"
		});
		const buf = await res.arrayBuffer();
		const html = new TextDecoder('windows-1252').decode(buf);

		const eventos = [];
		const re = /ver\(this,\s*'(\d+)'\s*\)[\s\S]*?<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>/gi;
		let m;
		while ((m = re.exec(html)) !== null) {
			const dt = m[2].trim();
			const d = parseDataBR(dt);
			eventos.push({ cdEvt: m[1], dt: dt, ts: d ? d.getTime() : 0 });
		}
		eventos.sort((a, b) => a.ts - b.ts);
		return eventos;
	}

	// detalhes de um evento: { 'Nome do Sensor': true/false, ... } (com cache)
	async function buscarDetalheSensores(cdEvt) {
		T.__acSensCache = T.__acSensCache || {};
		if (T.__acSensCache[cdEvt]) return T.__acSensCache[cdEvt];

		const url = `${URL_SENS_DET}?cd_evt=${encodeURIComponent(cdEvt)}`;
		const res = await fetch(url, {
			headers: {
				"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
				"upgrade-insecure-requests": "1"
			},
			method: "GET", mode: "cors", credentials: "include"
		});
		const buf = await res.arrayBuffer();
		const html = new TextDecoder('windows-1252').decode(buf);

		const sensores = {};
		try {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			doc.querySelectorAll('.status-item').forEach(el => {
				const nome = (el.textContent || '').replace(/\s+/g, ' ').trim();
				if (!nome) return;
				sensores[nome] = el.classList.contains('checked');
			});
		} catch (e) {}

		T.__acSensCache[cdEvt] = sensores;
		return sensores;
	}

	// executa worker(item) com no maximo "size" em paralelo
	async function poolAsync(items, size, worker, onProgress) {
		let i = 0, done = 0;
		const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
			for (;;) {
				const idx = i++;
				if (idx >= items.length) return;
				try { await worker(items[idx], idx); } catch (e) {}
				done++;
				if (onProgress) onProgress(done, items.length);
			}
		});
		await Promise.all(runners);
	}

	const PAGE_SIZE_SENSORES = 100;

	function abrirAlertasSensores(dados) {
		D.getElementById('modal-alertas-sensores')?.remove();

		const agora = new Date();
		const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000);

		const modal = D.createElement('div');
		modal.id = 'modal-alertas-sensores';
		modal.style.cssText =
			'position:fixed;top:5%;left:50%;transform:translateX(-50%);width:1000px;max-width:97vw;' +
			'max-height:90vh;overflow:hidden;background:#fff;z-index:2147483000;' +
			'display:flex;flex-direction:column;' +
			'';
		modal.classList.add('cop-jan');
		estiloJanelas();

		modal.innerHTML = `
			<div id="sens-header" class="cop-jan-head" style="--cop-acento:#3949AB;cursor:move;display:flex;align-items:center;gap:8px;user-select:none;">
				<span style="flex:1;">\u{1F4E1} Alertas de Sensores \u2014 ${escHtml(dados.placa || 'N/D')}</span>
				<button id="sens-fechar" class="cop-jan-x">\u2716</button>
			</div>
			<div style="padding:8px 12px;border-bottom:1px solid #ddd;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;background:#fafafa;">
				<label>De: <input id="sens-ini" type="text" value="${escAttr(fmtDataBR(ontem))}" size="16" style="padding:4px 6px;border:1px solid #ccc;border-radius:4px;"></label>
				<label>At\u00E9: <input id="sens-fim" type="text" value="${escAttr(fmtDataBR(agora))}" size="16" style="padding:4px 6px;border:1px solid #ccc;border-radius:4px;"></label>
				<button id="sens-buscar" style="background:#3949AB;color:#fff;border:none;border-radius:6px;padding:6px 16px;font-weight:bold;cursor:pointer;">\u{1F50D} Buscar</button>
				<label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:auto;">
					<input type="checkbox" id="sens-todos" checked> Mostrar sensores sem ativa\u00E7\u00E3o
				</label>
			</div>
			<div id="sens-corpo" style="padding:10px 12px;overflow:auto;font-size:12px;color:#222;flex:1;">
				Informe o per\u00EDodo e clique em Buscar.
			</div>`;

		D.body.appendChild(modal);
		D.getElementById('sens-fechar').onclick = () => modal.remove();

		// arraste
		const header = D.getElementById('sens-header');
		header.onmousedown = (e) => {
			if (e.target.closest('button')) return;
			const sx = e.clientX - modal.getBoundingClientRect().left;
			const sy = e.clientY - modal.getBoundingClientRect().top;
			const mv = ev => { modal.style.left = (ev.pageX - sx) + 'px'; modal.style.top = (ev.pageY - sy) + 'px'; modal.style.transform = 'none'; };
			const up = () => { D.removeEventListener('mousemove', mv); D.removeEventListener('mouseup', up); };
			D.addEventListener('mousemove', mv); D.addEventListener('mouseup', up);
			e.preventDefault();
		};

		// estado: {todos:[desc], pagina, eventos:[da pagina], mapa:{sensor:Set(idx)}, nomes:[]}
		let estado = null;

		D.getElementById('sens-buscar').onclick = buscar;
		D.getElementById('sens-todos').onchange = () => { if (estado && estado.eventos) renderGrid(); };

		async function buscar() {
			const corpo = D.getElementById('sens-corpo');
			const dtIni = (D.getElementById('sens-ini')?.value || '').trim();
			const dtFim = (D.getElementById('sens-fim')?.value || '').trim();
			if (!parseDataBR(dtIni) || !parseDataBR(dtFim)) {
				alert('Informe as datas no formato DD/MM/AAAA HH:MM.');
				return;
			}
			const btn = D.getElementById('sens-buscar');
			btn.disabled = true;
			corpo.innerHTML = '\u23F3 Buscando lista de eventos...';

			try {
				const todos = await buscarEventosSensores(dados.cd_veiculo, dtIni, dtFim);
				if (!todos.length) {
					corpo.innerHTML = '<div style="padding:12px;color:#555;">Nenhum alerta de sensores no per\u00EDodo.</div>';
					return;
				}
				todos.reverse(); // mais recentes primeiro (pagina 1 = 100 ultimos)
				estado = { todos: todos, pagina: 0, eventos: null, mapa: {}, nomes: [] };
				await carregarPagina();
			} catch (e) {
				console.error('[SENSORES] erro:', e);
				corpo.innerHTML = '<div style="padding:10px;color:#b22222;">Erro ao buscar os alertas. Veja o console (F12).</div>';
			} finally {
				btn.disabled = false;
			}
		}

		async function carregarPagina() {
			const corpo = D.getElementById('sens-corpo');
			const ini = estado.pagina * PAGE_SIZE_SENSORES;
			const eventos = estado.todos.slice(ini, ini + PAGE_SIZE_SENSORES);

			const detalhes = new Array(eventos.length);
			await poolAsync(eventos, 6, async (ev, idx) => {
				detalhes[idx] = await buscarDetalheSensores(ev.cdEvt);
			}, (done, total) => {
				corpo.innerHTML = `\u23F3 Buscando detalhes dos eventos... ${done}/${total}`;
			});

			const nomes = [];
			const mapa = {};
			detalhes.forEach((det, idx) => {
				if (!det) return;
				Object.keys(det).forEach(nome => {
					if (nomes.indexOf(nome) === -1) { nomes.push(nome); mapa[nome] = new Set(); }
					if (det[nome]) mapa[nome].add(idx);
				});
			});

			estado.eventos = eventos;
			estado.mapa = mapa;
			estado.nomes = nomes;
			renderGrid();
		}

		function renderGrid() {
			const corpo = D.getElementById('sens-corpo');
			const r = estado;
			const mostrarTodos = !!D.getElementById('sens-todos')?.checked;

			// colunas = sensores (mais ativacoes primeiro); oculta sem ativacao salvo se marcado
			let colunas = r.nomes
				.map(n => ({ nome: n, qtd: r.mapa[n].size }))
				.sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome));
			if (!mostrarTodos) colunas = colunas.filter(c => c.qtd > 0);

			const totalPag = Math.max(1, Math.ceil(r.todos.length / PAGE_SIZE_SENSORES));
			const ini = r.pagina * PAGE_SIZE_SENSORES;
			const fim = Math.min(ini + PAGE_SIZE_SENSORES, r.todos.length);
			const nav =
				'<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;">' +
				`<button id="sens-pg-prev" ${r.pagina === 0 ? 'disabled' : ''} style="padding:4px 10px;border:1px solid #ccc;border-radius:5px;background:#fff;cursor:pointer;">\u2039 Mais recentes</button>` +
				`<span style="color:#555;">P\u00E1gina ${r.pagina + 1}/${totalPag} \u2014 eventos ${ini + 1}\u2013${fim} de ${r.todos.length} (mais recentes primeiro)</span>` +
				`<button id="sens-pg-next" ${r.pagina >= totalPag - 1 ? 'disabled' : ''} style="padding:4px 10px;border:1px solid #ccc;border-radius:5px;background:#fff;cursor:pointer;">Mais antigos \u203A</button>` +
				'<span style="margin-left:auto;color:#555;">c\u00E9lula <span style="display:inline-block;width:11px;height:11px;background:#e53935;border-radius:2px;vertical-align:middle;"></span> = sensor ativo</span>' +
				'</div>';

			function ligarNav() {
				const p = D.getElementById('sens-pg-prev');
				const n = D.getElementById('sens-pg-next');
				if (p) p.onclick = () => { if (estado.pagina > 0) { estado.pagina--; carregarPagina(); } };
				if (n) n.onclick = () => { if (estado.pagina < totalPag - 1) { estado.pagina++; carregarPagina(); } };
			}

			if (!colunas.length) {
				corpo.innerHTML = nav +
					'<div style="padding:12px;color:#2e7d32;">\u2714 Nenhum sensor ativo nos eventos desta p\u00E1gina.' +
					' Marque "Mostrar sensores sem ativa\u00E7\u00E3o" para ver a grade completa.</div>';
				ligarNav();
				return;
			}

			// cabecalho: Data/Hora + um sensor por coluna (nome na vertical)
			let ths = '';
			colunas.forEach(c => {
				ths += `<th title="${escAttr(c.nome + ' \u2014 ' + c.qtd + ' ativa\u00E7\u00F5es nesta p\u00E1gina')}" style="padding:5px 3px;border-bottom:1px solid #ccc;border-left:1px solid #eee;background:#f5f5f5;position:sticky;top:0;z-index:1;vertical-align:bottom;min-width:60px;max-width:84px;">` +
					`<div style="font-size:10px;line-height:1.15;white-space:normal;word-wrap:break-word;text-align:center;color:${c.qtd ? '#b71c1c' : '#666'};font-weight:${c.qtd ? 'bold' : 'normal'};">${escHtml(c.nome)}<br><span style="color:#999;font-weight:normal;">(${c.qtd})</span></div></th>`;
			});

			// linhas = eventos (mais recente no topo); data/hora fixa a esquerda
			let linhasHtml = '';
			r.eventos.forEach((ev, idx) => {
				let tds = '';
				colunas.forEach(c => {
					const ativo = r.mapa[c.nome].has(idx);
					tds += `<td title="${escAttr(c.nome + ' \u2014 ' + ev.dt)}" style="padding:1px;border-bottom:1px solid #eee;text-align:center;">` +
						`<div style="width:13px;height:13px;border-radius:2px;background:${ativo ? '#e53935' : '#f0f0f0'};margin:0 auto;"></div></td>`;
				});
				const rotuloDt = ev.dt.slice(0, 5) + ' ' + ev.dt.slice(11); // DD/MM HH:MM:SS
				linhasHtml +=
					'<tr>' +
					`<td style="position:sticky;left:0;background:#fff;z-index:2;padding:2px 8px 2px 4px;border-bottom:1px solid #eee;white-space:nowrap;color:#111;font-weight:bold;">${escHtml(rotuloDt)}</td>` +
					tds + '</tr>';
			});

			corpo.innerHTML = nav +
				'<div style="overflow:auto;max-height:58vh;border:1px solid #ddd;border-radius:6px;">' +
				'<table style="border-collapse:collapse;font-size:11px;">' +
				`<thead><tr><th style="position:sticky;left:0;top:0;background:#f5f5f5;z-index:3;padding:2px 8px;border-bottom:1px solid #ccc;text-align:left;">Data/Hora</th>${ths}</tr></thead>` +
				`<tbody>${linhasHtml}</tbody></table></div>`;
			ligarNav();
		}
	}

	/* =========================================================
	   3f. VARREDURA DE SENSORES DEFEITUOSOS (supervisao + alertas)
	   ========================================================= */
	// placas com ocorrencia em aberto/reagendada na supervisao
	async function buscarPlacasSupervisao(urlBase, info, fonte, cdBase, cdSituacao) {
		const url = `${urlBase}?cd_clifor=&info=${encodeURIComponent(info)}&cd_situacao=${encodeURIComponent(cdSituacao || '')}&cd_reagendado=&cd_pgr=0&cd_base=${encodeURIComponent(cdBase || CD_BASE_SUPERVISAO)}`;
		const res = await fetch(url, {
			headers: {
				"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
				"upgrade-insecure-requests": "1"
			},
			method: "GET", mode: "cors", credentials: "include"
		});
		const buf = await res.arrayBuffer();
		const html = new TextDecoder('windows-1252').decode(buf);

		const placas = [];
		// ver(this, cd_veiculo, 'PLACA', 'cd_clifor') ... <td>PLACA - CLIENTE</td>
		const re = /ver\(this,\s*(\d+),\s*'([^']+)',\s*'([^']*)'\s*\)[\s\S]*?<td[^>]*>([^<]*)<\/td>/gi;
		let m;
		while ((m = re.exec(html)) !== null) {
			const desc = (m[4] || '').replace(/\s+/g, ' ').trim();
			const cliente = desc.indexOf(' - ') !== -1 ? desc.split(' - ').slice(1).join(' - ') : '';
			placas.push({ cdVeiculo: m[1], placa: m[2], cdClifor: m[3], cliente: cliente, fonte: fonte });
		}
		return placas;
	}

	// amostra ate "max" indices uniformes (sempre inclui o primeiro e o ultimo)
	function amostrarIndices(len, max) {
		if (len <= max) return Array.from({ length: len }, (_, i) => i);
		const idxs = [];
		const passo = (len - 1) / (max - 1);
		for (let i = 0; i < max; i++) {
			const idx = Math.round(i * passo);
			if (idxs.indexOf(idx) === -1) idxs.push(idx);
		}
		return idxs;
	}

	// analisa um sensor de uma placa: divide a janela em blocos isolados e
	// verifica alguns eventos espalhados DENTRO de cada bloco.
	async function analisarSensorPlaca(cdVeiculo, sensorNome, progressCb) {
		const agora = new Date();
		const ini = new Date(agora.getTime() - VARREDURA_JANELA_H * 60 * 60 * 1000);
		const eventos = await buscarEventosSensores(cdVeiculo, fmtDataBR(ini), fmtDataBR(agora)); // asc

		if (!eventos.length) return { status: 'sem-eventos', eventos: 0, amostrados: 0, ativos: 0, pct: 0, spanH: 0, blocosAtivos: 0, blocosVerif: 0 };

		// agrupa os indices dos eventos por bloco de tempo
		const iniMs = ini.getTime();
		const tamBlocoMs = (VARREDURA_JANELA_H * 3600000) / VARREDURA_BLOCOS;
		const blocos = Array.from({ length: VARREDURA_BLOCOS }, () => []);
		eventos.forEach((ev, idx) => {
			let b = Math.floor((ev.ts - iniMs) / tamBlocoMs);
			if (b < 0) b = 0;
			if (b >= VARREDURA_BLOCOS) b = VARREDURA_BLOCOS - 1;
			blocos[b].push(idx);
		});

		// escolhe ate N eventos espalhados dentro de cada bloco (primeiro/meio/fim)
		const escolhidos = []; // {idx, bloco}
		blocos.forEach((lista, b) => {
			if (!lista.length) return;
			amostrarIndices(lista.length, VARREDURA_EVT_BLOCO).forEach(i => {
				escolhidos.push({ idx: lista[i], bloco: b });
			});
		});

		let ativos = 0, presentes = 0;
		let tsAtivoMin = Infinity, tsAtivoMax = -Infinity;
		const blocoPresente = new Set(), blocoAtivo = new Set();

		await poolAsync(escolhidos, 4, async (e) => {
			const det = await buscarDetalheSensores(eventos[e.idx].cdEvt);
			if (det && Object.prototype.hasOwnProperty.call(det, sensorNome)) {
				presentes++;
				blocoPresente.add(e.bloco);
				if (det[sensorNome]) {
					ativos++;
					blocoAtivo.add(e.bloco);
					const ts = eventos[e.idx].ts;
					if (ts < tsAtivoMin) tsAtivoMin = ts;
					if (ts > tsAtivoMax) tsAtivoMax = ts;
				}
			}
		}, (d, t) => { if (progressCb) progressCb(d, t); });

		const spanH = (eventos[eventos.length - 1].ts - eventos[0].ts) / 3600000;
		if (!presentes) return { status: 'sensor-inexistente', eventos: eventos.length, amostrados: 0, ativos: 0, pct: 0, spanH: spanH, spanAtivoH: 0, blocosAtivos: 0, blocosVerif: 0 };

		const pct = Math.round((ativos / presentes) * 100);
		const blocosVerif = blocoPresente.size;
		const blocosAtivos = blocoAtivo.size;
		const cobertura = blocosVerif ? (blocosAtivos / blocosVerif) * 100 : 0;

		// tempo em que o SENSOR ficou alarmando (1a -> ultima verificacao ATIVA)
		const spanAtivoH = (ativos > 0) ? (tsAtivoMax - tsAtivoMin) / 3600000 : 0;
		const horasPorBloco = VARREDURA_JANELA_H / VARREDURA_BLOCOS;

		// a classificacao final (defeito/intermitente/ok) e feita DEPOIS, quando o
		// teto de historico da rodada for conhecido (classificarVarredura)
		let status = 'avaliar';
		if (presentes < 5) status = 'insuficiente';

		return {
			status: status, eventos: eventos.length, amostrados: presentes, ativos: ativos,
			pct: pct, cobertura: cobertura,
			spanH: Math.round(spanH * 10) / 10,
			spanAtivoH: Math.round(spanAtivoH * 10) / 10,
			saturado: false,
			blocosAtivos: blocosAtivos, blocosVerif: blocosVerif
		};
	}

	// classifica com base no teto de historico OBSERVADO na rodada:
	// o sistema so devolve um historico limitado da API da tecnologia (~12h hoje,
	// medido dinamicamente); alarme cobrindo quase todo esse maximo = quase certo defeito.
	function classificarVarredura(r, tetoH) {
		const horasPorBloco = VARREDURA_JANELA_H / VARREDURA_BLOCOS;
		const blocosMin = Math.max(4, Math.ceil((r.spanAtivoH / horasPorBloco) * 0.6));
		r.saturado = r.spanAtivoH >= VARREDURA_SPAN_SAT_MIN_H &&
			r.spanH > 0 && (r.spanAtivoH / r.spanH) >= VARREDURA_SATURACAO &&
			tetoH > 0 && r.spanAtivoH >= tetoH * VARREDURA_SATURACAO;
		let status = 'ok';
		if ((r.spanAtivoH >= VARREDURA_SPAN_MIN_CURTO_H || r.saturado) && r.blocosAtivos >= blocosMin) {
			if (r.pct >= VARREDURA_PCT_MIN && r.cobertura >= VARREDURA_COB_MIN) status = 'defeito';
			else if (r.pct >= VARREDURA_PCT_INTERM) status = 'intermitente';
		}
		r.status = status;
	}

	/* ===== FALSO POSITIVO DA VARREDURA =====
	   Placa+sensor que o operador conferiu na tecnologia e constatou que N\u00C3O
	   \u00E9 defeito. Fica guardado no navegador e some da lista de suspeitas por
	   VARREDURA_FP_DIAS dias \u2014 depois disso volta a ser avaliado, porque um
	   sensor bom hoje pode falhar depois.                                      */
	const VARREDURA_FP_CHAVE = 'cop_varredura_fp';
	const VARREDURA_FP_DIAS  = 30;

	function fpMapa() {
		if (!T.__acFP) {
			let dados = null;
			try { dados = JSON.parse(localStorage.getItem(VARREDURA_FP_CHAVE) || '{}'); } catch (e) { dados = {}; }
			T.__acFP = (dados && typeof dados === 'object') ? dados : {};
		}
		return T.__acFP;
	}
	function fpGravar() {
		try { localStorage.setItem(VARREDURA_FP_CHAVE, JSON.stringify(T.__acFP || {})); } catch (e) { }
	}
	const fpChave = (placa, sensor) => String(placa || '').toUpperCase() + '|' + String(sensor || '').toUpperCase();

	// devolve {ts, quando} se marcado e ainda v\u00E1lido; limpa o que expirou
	function fpAtivo(placa, sensor) {
		const m = fpMapa(), k = fpChave(placa, sensor), it = m[k];
		if (!it) return null;
		if (Date.now() - it.ts > VARREDURA_FP_DIAS * 24 * 3600000) { delete m[k]; fpGravar(); return null; }
		return it;
	}
	function fpMarcar(placa, sensor, ativo) {
		const m = fpMapa(), k = fpChave(placa, sensor);
		if (ativo) {
			const d = new Date();
			const p2 = n => String(n).padStart(2, '0');
			m[k] = { ts: d.getTime(), quando: `${p2(d.getDate())}/${p2(d.getMonth() + 1)}` };
		} else delete m[k];
		fpGravar();
	}

	/* ===== HIST\u00D3RICO DE VERS\u00D5ES ===== */
	const CENTRAL_VERSAO = '26.0';
	const CHANGELOG = [
		['25.0', ['Liberar por lista ganha "Desfazer", que exclui as autoriza\u00E7\u00F5es criadas',
			'na \u00FAltima execu\u00E7\u00E3o.']],
		['24.9', ['Novo "Liberar por lista": cola as placas, escolhe o tipo de autoriza\u00E7\u00E3o',
			'e o per\u00EDodo, e libera todas de uma vez.']],
		['24.8', ['\u00C1rea de posto no plural ("POSTOS") tamb\u00E9m deixa de impedir a puni\u00E7\u00E3o.']],
		['24.7', ['A nota "ve\u00EDculo em hor\u00E1rio de pernoite" s\u00F3 entra em frotas que restringem',
			'o contato nesse hor\u00E1rio; nas de contato livre, deixa de aparecer.']],
		['24.6', ['Cancelar puni\u00E7\u00E3o recadastra com a data do evento e o tipo originais',
			'(antes usava a data de hoje e o tipo velocidade).']],
		['24.5', ['Velocidade excedida da Rossini n\u00E3o pode ser iniciada fora do pernoite:',
			'o bot\u00E3o Punir d\u00E1 lugar a "s\u00F3 no pernoite" nessas linhas.']],
		['24.4', ['Fora do pernoite, s\u00F3 Belluno (qualquer tipo) e Rossini dire\u00E7\u00E3o ininterrupta',
			'come\u00E7am na hora do clique; velocidade da Rossini segue iniciando \u00E0s 05h.',
			'Aviso quando a placa tem mais de uma puni\u00E7\u00E3o. Menu: "Puni\u00E7\u00F5es".']],
		['24.3', ['Aguardando puni\u00E7\u00E3o avisa quando a \u00FAltima macro \u00E9 de carga/descarga,',
			'para conferir se o ve\u00EDculo est\u00E1 em cliente antes de punir.']],
		['24.2', ['Corrige "Repetir tratativa", que sumia depois que a primeira ocorr\u00EAncia',
			'da placa era tratada e saía da lista.']],
		['24.1', ['Tecnologia da placa passa a ser encontrada tamb\u00E9m fora do grid aberto,',
			'por um \u00EDndice montado a partir da base.']],
		['24.0', ['Libera\u00E7\u00E3o de sensor: log detalhado no console (F12) e aviso claro quando',
			'n\u00E3o h\u00E1 comando para a tecnologia + sensor.']],
		['23.9', ['"Autorizado por" passa a usar um nome sorteado da lista da transportadora',
			'(ex.: CLIENTE FRIBON), em vez do nome do operador.']],
		['23.8', ['Anota\u00E7\u00E3o de puni\u00E7\u00E3o finalizada passa a citar a data do evento.']],
		['23.7', ['Concluir puni\u00E7\u00E3o anota na placa e desfixa o ve\u00EDculo do grid.']],
		['23.6', ['Iniciar puni\u00E7\u00E3o fixa o ve\u00EDculo no grid; cancelar desfixa.']],
		['23.5', ['Prazo para punir corrigido para 7 dias \u2014 afeta o cadastro de puni\u00E7\u00F5es',
			'e a data do evento mostrada no informativo e na anota\u00E7\u00E3o.']],
		['23.4', ['Informativo e anota\u00E7\u00E3o da puni\u00E7\u00E3o passam a citar a data do evento.']],
		['23.3', ['Informativo de puni\u00E7\u00E3o passa a resolver o endere\u00E7o pelo endpoint correto',
			'do portal, funcionando com a placa fora do grid.']],
		['23.2', ['Informativo de puni\u00E7\u00E3o resolve o endere\u00E7o pela coordenada quando a placa',
			'n\u00E3o est\u00E1 no grid aberto.']],
		['23.1', ['Comando de libera\u00E7\u00E3o ao cancelar puni\u00E7\u00E3o reconhece a tecnologia escrita de',
			'formas diferentes (ONIXSAT, ONIX SAT) e a busca no grid quando falta.']],
		['23.0', ['Informativo de puni\u00E7\u00E3o procura o endere\u00E7o tamb\u00E9m pela linha da placa no grid.']],
		['22.9', ['Autoriza\u00E7\u00E3o de Estado Desativado tamb\u00E9m impede a puni\u00E7\u00E3o;',
			've\u00EDculo parado em \u00E1rea de posto pode ser punido (antes ficava de fora).']],
		['22.8', ['Iniciar puni\u00E7\u00E3o confere se o portal confirmou o bloqueio e avisa quando n\u00E3o',
			'confirmou, em vez de dar como enviado.']],
		['22.7', ['Informativo de puni\u00E7\u00E3o busca o endere\u00E7o do ve\u00EDculo no grid;',
			'a anota\u00E7\u00E3o na placa passa a citar o motivo da puni\u00E7\u00E3o.']],
		['22.6', ['Velocidade deixa de entrar na anota\u00E7\u00E3o "informado via grupo do cliente".']],
		['22.5', ['Comentario do arquivo atualizado com todas as funcoes do script.']],
		['22.4', ['Comando de desabilitar sensor reconhece a tecnologia escrita de formas',
			'diferentes (ONIXSAT, ONIX SAT) e pergunta quando n\u00E3o encontra o comando.']],
		['22.3', ['Puni\u00E7\u00E3o com tempo encerrado aparece como "Puni\u00E7\u00E3o finalizada" em vez de',
			'"Cumprindo puni\u00E7\u00E3o \u2014 restam ?".']],
		['22.2', ['Corrige o comando de desabilitar sensor, que n\u00E3o era enviado por falta da',
			'tecnologia da placa na varredura.']],
		['22.1', ['Corrige o bot\u00E3o "Marcar defeito", que n\u00E3o estava aparecendo na varredura.']],
		['22.0', ['OMNILINK completo: cancelar puni\u00E7\u00E3o envia Deslacrar Motor; desbloqueio em massa',
			'e solicitar posi\u00E7\u00E3o passam a cobrir OMNILINK e SASCAR.']],
		['21.9', ['Varredura: bot\u00E3o "Marcar defeito" libera as op\u00E7\u00F5es em placas que n\u00E3o bateram',
			'o padr\u00E3o, para quando o defeito \u00E9 confirmado na tecnologia.']],
		['21.8', ['Cancelar puni\u00E7\u00E3o envia o comando que libera o ve\u00EDculo conforme a tecnologia',
			'(ONIX e SASCAR desbloqueiam, SIGHRA reset e desbloqueio) e anota na placa.']],
		['21.7', ['Informativo de puni\u00E7\u00E3o inclui o link do Google Maps com a posi\u00E7\u00E3o do ve\u00EDculo.']],
		['21.6', ['Aguardando puni\u00E7\u00E3o lista tamb\u00E9m quem est\u00E1 cumprindo (para poder cancelar ou concluir);',
			'informativo corrige o Local e os hor\u00E1rios; macro de carga/descarga n\u00E3o pune.']],
		['21.5', ['Fora do hor\u00E1rio de pernoite, a puni\u00E7\u00E3o come\u00E7a na hora em que o operador',
			'inicia (10h + 11h = desbloqueio 21h); no pernoite, segue come\u00E7ando \u00E0s 05h.']],
		['21.4', ['Punir aceita nome curto do motorista quando o cadastro tem sobrenome a mais',
			'(S\u00E9rgio Da Rocha \u2192 SERGIO DA ROCHA OLIVEIRA); com dois candidatos, n\u00E3o cadastra.']],
		['21.3', ['Puni\u00E7\u00F5es coladas da frota s\u00E3o cadastradas como dire\u00E7\u00E3o ininterrupta (tipo 3).']],
		['21.2', ['Puni\u00E7\u00F5es: bot\u00E3o "Colar da frota" l\u00EA o aviso da transportadora (placas, motoristas,',
			'horas e data) e cadastra todas de uma vez, com prazo de 7 dias.']],
		['21.1', ['Ao liberar um sensor na varredura, a placa recebe anota\u00E7\u00E3o com o sensor',
			'e o per\u00EDodo da libera\u00E7\u00E3o.']],
		['20.9', ['Libera\u00E7\u00E3o pela varredura envia tamb\u00E9m o comando de desabilitar o sensor',
			'(ONIX, SASCAR e SIGHRA); sem comando cadastrado, s\u00F3 registra a libera\u00E7\u00E3o.']],
		['20.8', ['Autoriza\u00E7\u00E3o "Rastreado por outra GR" tamb\u00E9m impede a puni\u00E7\u00E3o;',
			've\u00EDculo a at\u00E9 5 km de um alvo recebe aviso para conferir no mapa antes de punir.']],
		['20.7', ['"Repetir tratativa" s\u00F3 aparece quando a placa tem outra ocorr\u00EAncia e o passo',
			'j\u00E1 foi tratado nela \u2014 n\u00E3o mais em placa com uma \u00FAnica ocorr\u00EAncia.']],
		['20.6', ['Leitura do telefone do condutor apenas de campos com r\u00F3tulo (Fone, Tel, Celular),',
			'aceitando n\u00FAmero formatado. N\u00FAmeros de outros campos n\u00E3o s\u00E3o mais aproveitados.']],
		['20.4', ['Corrige telefone do condutor que n\u00E3o era lido quando vinha formatado',
			'(par\u00EAnteses, espa\u00E7o ou h\u00EDfen) ou com outro r\u00F3tulo (Celular, Tel).']],
		['20.3', ['Ocorr\u00EAncias da mesma placa: bot\u00E3o "Repetir tratativa" aplica a resposta j\u00E1 dada',
			'nos passos iguais, sem refazer anota\u00E7\u00E3o; passo diferente abre para o operador.']],
		['20.2', ['Corrige telefone com 0 antes do DDD (ex.: 06294075335), que aparecia como',
			'"sem n\u00FAmero cadastrado".']],
		['20.1', ['Em hor\u00E1rio de pernoite: sem texto do operador, a placa recebe s\u00F3 a nota de',
			'pernoite; com texto, vai apenas o que o operador escreveu.']],
		['20.0', ['Janela de Puni\u00E7\u00F5es mais larga: a lista cabe sem rolagem lateral.']],
		['19.9', ['Puni\u00E7\u00E3o s\u00F3 liberada se a coordenada tamb\u00E9m confirmar o ve\u00EDculo parado',
			'(velocidade pode estar travada em 0); bot\u00E3o "Finalizar" para puni\u00E7\u00F5es cumpridas;',
			'PDF do relat\u00F3rio sai como dia-m\u00EAs-ano; Velocidade em massa trata Estado Desativado.']],
		['19.8', ['Aguardando puni\u00E7\u00E3o: bot\u00E3o "Cancelar" desfaz a puni\u00E7\u00E3o e cadastra outra igual,',
			'para o condutor cumprir depois.']],
		['19.7', ['Solicitar posi\u00E7\u00E3o s\u00F3 envia para placas com Posi\u00E7\u00E3o em Atraso,',
			'Bloquear Pernoite ou Desbloquear Pernoite.']],
		['19.6', ['Corrige erro "i is not defined" ao listar o Aguardando puni\u00E7\u00E3o.']],
		['19.5', ['Aguardando puni\u00E7\u00E3o: bot\u00F5es "Iniciar puni\u00E7\u00E3o" (baixa, bloqueio com desbloqueio',
			'programado e anota\u00E7\u00E3o na placa) e "Informativo" para a transportadora.']],
		['19.4', ['Em hor\u00E1rio de pernoite, a placa recebe s\u00F3 a nota de pernoite \u2014 sem a frase de',
			'tentativa de contato sem sucesso, e apenas se o operador escrever algo.']],
		['19.3', ['Falta de macro: aceita a macro do meio-dia anterior at\u00E9 o limite da frota',
			'(Colli 22h, Falleiro 23h), procura no hist\u00F3rico de macros e ignora perda de posi\u00E7\u00E3o.']],
		['19.2', ['Informativo: negrito (*texto*) em Placa, Motorista, Data/Hora, Local,',
			'Igni\u00E7\u00E3o/Velocidade e \u00DAltima Macro, al\u00E9m das ocorr\u00EAncias e do contato.']],
		['19.1', ['Corrige erro ao abrir o passo ("jaAnotouContato before initialization").']],
		['19.0', ['Na 2\u00AA ocorr\u00EAncia da mesma placa, a anota\u00E7\u00E3o de contato n\u00E3o se repete.']],
		['18.9', ['Varredura: liberar o sensor com defeito por 7 dias e gerar o informativo',
			'para o grupo da transportadora e o analista.']],
		['18.8', ['Passo do mapa: bot\u00E3o "Copiar print" p\u00F5e a imagem do mapa na \u00E1rea de transfer\u00EAncia.']],
		['18.7', ['Corrige o print do mapa que saía sem o fundo (s\u00F3 tra\u00E7ado e marcadores).']],
		['18.6', ['Tentativa de contato: quando o WhatsApp foi enviado, a anota\u00E7\u00E3o registra',
			'"aguardando retorno" junto da tentativa via fixo.']],
		['18.5', ['Passo do mapa: "Copiar print" gera a imagem na hora, sem pedir captura de tela',
			'(usa a camada OpenStreetMap). Se o mapa estiver em Sat\u00E9lite, pede a captura.']],
		['18.4', ['Passo do mapa: bot\u00E3o "Copiar print" p\u00F5e uma imagem do mapa na \u00E1rea de',
			'transfer\u00EAncia, para enviar junto do informativo em desvio de rota.']],
		['18.3', ['Tentativa de contato sem sucesso passa a citar apenas o fixo \u2014 o WhatsApp',
			'fica como "aguardando retorno", j\u00E1 que o condutor ainda pode responder.']],
		['18.2', ['Corrige o mapa que n\u00E3o crescia junto com a janela ampliada.']],
		['18.1', ['Passo do mapa: a janela usa toda a altura da tela e o mapa estica junto,',
			'ficando bem mais alto (janela um pouco mais estreita para melhorar a propor\u00E7\u00E3o).']],
		['18.0', ['Passo do mapa: mais altura \u00FAtil \u2014 cabe\u00E7alho em uma linha e a posi\u00E7\u00E3o',
			'no t\u00EDtulo da janela, deixando o mapa com propor\u00E7\u00E3o melhor.']],
		['17.9', ['Passo do mapa abre a janela ampliada; ao avan\u00E7ar, ela volta ao tamanho normal.']],
		['17.8', ['Libera\u00E7\u00E3o em massa da Rossini envia tamb\u00E9m o comando Autoriza Desengate;',
			'Aguardando puni\u00E7\u00E3o ganhou o bot\u00E3o de ver a placa no mapa.']],
		['17.7', ['Passo do mapa: altura calculada pelo espa\u00E7o real da janela \u2014 sem rolagem vertical',
			'nem horizontal, e o mapa se reajusta ao redimensionar a tela.']],
		['17.6', ['Passo do mapa sem campo de observa\u00E7\u00E3o: s\u00F3 o mapa e os bot\u00F5es, sem rolagem.']],
		['17.5', ['Passo do mapa: altura ajustada \u00E0 tela \u2014 os bot\u00F5es SIM/N\u00C3O ficam vis\u00EDveis sem rolar.']],
		['17.4', ['Passo de visualiza\u00E7\u00E3o no mapa: o mapa aparece dentro da pr\u00F3pria tela do passo.']],
		['17.3', ['A janela "Integra\u00E7\u00F5es / Alertas Cr\u00EDticos" passa a ser barrada antes de abrir,',
			'em vez de fechada depois (sem piscar na tela).']],
		['17.2', ['Tratar Ocorr\u00EAncias fecha sozinho tamb\u00E9m quando as ocorr\u00EAncias ficam reagendadas,',
			'mostrando o resumo antes de atualizar o grid.']],
		['17.1', ['Fecha sozinho a janela "Integra\u00E7\u00F5es / Alertas Cr\u00EDticos" que reabre a cada',
			'atualiza\u00E7\u00E3o do grid (o fechamento fica registrado no console).']],
		['17.0', ['Tratar Ocorr\u00EAncias: ao concluir todos os passos da placa, o painel fecha sozinho',
			'e o grid \u00E9 atualizado.']],
		['16.8', ['Acionamento policial: o passo \u00E9 dado sozinho ap\u00F3s registrar \u2014 SIM quando houve',
			'contato com algum posto, N\u00C3O quando n\u00E3o houve contato ou n\u00E3o havia posto pr\u00F3ximo.']],
		['16.6', ['Aguardando puni\u00E7\u00E3o: s\u00F3 as autoriza\u00E7\u00F5es de Trafegar e Descarga/Rein\u00EDcio Noturno',
			'impedem a puni\u00E7\u00E3o; as demais s\u00E3o ignoradas.']],
		['16.5', ['Corrige "DESBLOQ_PAUSA_MS is not defined" ao solicitar posi\u00E7\u00E3o.']],
		['16.4', ['Comandos em massa (reset/desbloqueio e solicitar posi\u00E7\u00E3o) enviados em lotes de 10 placas,',
			'com pausa entre os requests, para n\u00E3o sobrecarregar o servidor.']],
		['16.3', ['Corrige erro que impedia o envio do reset/desbloqueio em massa',
			'("Cannot access \u2018enviaveis\u2019 before initialization").']],
		['16.2', ['Menu sem duplica\u00E7\u00E3o: "Reset e desbloqueio" (janela com filtro por transportadora)',
			'e "Solicitar posi\u00E7\u00E3o" (direto nas placas do grid) s\u00E3o itens separados.']],
		['16.1', ['Solicitar posi\u00E7\u00E3o: mensagens de diagn\u00F3stico no console (F12) para investigar envios.']],
		['16.0', ['Solicitar posi\u00E7\u00E3o pelo menu agora confirma e envia direto para as placas do grid;',
			'para filtrar por transportadora, use Comandos em massa.']],
		['15.9', ['Corrige o alerta de hor\u00E1rio que ainda barrava a abertura de Comandos em massa.']],
		['15.8', ['Menu: "Desbloqueio" virou "Comandos em massa" e abre a qualquer hora;',
			'a janela das 04h \u00E0s 07h passa a valer s\u00F3 para o envio do reset/desbloqueio.']],
		['15.7', ['Solicitar posi\u00E7\u00E3o: r\u00F3tulo correto por tecnologia (SIGHRA usa "Requisi\u00E7\u00E3o de Posi\u00E7\u00E3o").']],
		['15.6', ['Comando em massa: nova op\u00E7\u00E3o "Solicitar posi\u00E7\u00E3o", liberada a qualquer hora',
			'e sem a trava de puni\u00E7\u00E3o (\u00E9 apenas consulta).']],
		['15.5', ['Velocidade em massa: age nas placas j\u00E1 vis\u00EDveis no grid, sem janela \u2014',
			'confirma e reagenda; as de formalizar via grupo ficam para o operador informar.']],
		['15.3', ['Libera\u00E7\u00E3o em massa: autoriza\u00E7\u00E3o de desengate da Rossini de agora at\u00E9 as 18h.']],
		['15.2', ['Hist\u00F3rico de vers\u00F5es (esta janela), acess\u00EDvel pelo menu.']],
		['15.1', ['Varredura: bot\u00E3o "N\u00E3o \u00E9 defeito" marca falso positivo por placa+sensor;',
			'marcadas somem das suspeitas por 30 dias e depois voltam a ser avaliadas.']],
		['15.0', ['Baixa sem tratativa: aviso lista os casos de uso (alerta falso, pedido da frota,',
			'anota\u00E7\u00F5es manuais e libera\u00E7\u00E3o de sensor defeituoso).']],
		['14.8', ['Novo "Baixar sem tratativa": marca todos os passos como N\u00C3O, sem anota\u00E7\u00E3o na placa.']],
		['14.7', ['Corrige a leitura da coluna Macro do grid (aparecia "sem macro" em toda placa).']],
		['14.6', ['Tema do grid removido a pedido.']],
		['14.4', ['Puni\u00E7\u00E3o por falta de macro s\u00F3 dentro da janela de pernoite da frota',
			'(Colli 22h\u201305h, Falleiro 23h\u201305h) e a macro precisa ser da noite vigente.']],
		['14.3', ['Nova aba "Falta de macro": Colli (FIM DE JORNADA) e Falleiro (PERNOITE).',
			'Registra s\u00F3 a anota\u00E7\u00E3o \u2014 o bloqueio segue manual.']],
		['14.2', ['Puni\u00E7\u00E3o de dias anteriores deixa de aparecer como expirada;',
			'categoria "puni\u00E7\u00E3o antiga" removida (essas placas podem ser desbloqueadas).']],
		['14.1', ['Anota\u00E7\u00E3o "n\u00E3o desbloquear" tamb\u00E9m bloqueia a placa, sem precisar da palavra puni\u00E7\u00E3o.']],
		['14.0', ['Puni\u00E7\u00E3o expira por hor\u00E1rio (Falleiro 10h, Colli e Rossini 9h);',
			'desbloqueio em massa liberado apenas das 04h \u00E0s 07h.']],
		['13.9', ['Comando de desbloqueio por tecnologia: SIGHRA usa Reset de Alarmes e Desbloqueio (94).']],
		['13.8', ['PDF do cliente passa a ser o relat\u00F3rio detalhado; puni\u00E7\u00E3o s\u00F3 de 11 a 29 (Rossini)',
			'e de 6 a 29 picos (Belluno) \u2014 acima disso, desconsidera.']],
		['13.7', ['Tratar Ocorr\u00EAncias e Criar Informativo destacados no painel.']],
		['13.5', ['Script liberado para todos os operadores (data de reagendamento segue restrita);',
			'janelas do script padronizadas.']],
		['13.4', ['Corrige o script se auto-removendo durante a recarga do grid e a busca repetida do telefone.']],
		['13.0', ['Console do operador: launcher + painel no lugar da pilha de bot\u00F5es.']],
		['12.9', ['Verifica\u00E7\u00E3o de puni\u00E7\u00E3o: origem e destino da viagem entram como impedimento.']],
		['12.8', ['Verifica\u00E7\u00E3o de puni\u00E7\u00E3o passa a olhar as 3 \u00FAltimas posi\u00E7\u00F5es.']],
		['12.5', ['Desbloqueio em massa, com trava para placas em puni\u00E7\u00E3o.']],
		['12.3', ['M\u00F3dulo de puni\u00E7\u00F5es por excesso de velocidade (relat\u00F3rio, PDF e cadastro).']],
		['12.0', ['Passo pr\u00F3prio para envio de WhatsApp ao motorista.']],
		['11.6', ['Vers\u00E3o Tampermonkey: instala sozinho com o Grid Padr\u00E3o aberto.']],
		['11.5', ['Telefone do condutor: celular tem prioridade; s\u00F3 fixo cadastrado tamb\u00E9m serve.']],
		['11.0', ['Contatos de frota da Transzape e op\u00E7\u00E3o "N\u00E3o precisou".']],
		['10.x', ['Plano de passos nos cards, contatos da frota APS, regras das 22 frotas do manual,',
			'varredura de sensores defeituosos e alertas de sensores.']]
	];

	function abrirChangelog() {
		D.getElementById('modal-changelog')?.remove();
		estiloJanelas();

		const modal = D.createElement('div');
		modal.id = 'modal-changelog';
		modal.className = 'cop-jan';
		modal.style.cssText =
			'position:fixed;top:8%;left:50%;transform:translateX(-50%);width:560px;max-width:95vw;' +
			'max-height:82vh;background:#fff;z-index:2147483000;display:flex;flex-direction:column;';

		modal.innerHTML =
			'<div id="cl-header" class="cop-jan-head" style="--cop-acento:#7C8CF8;cursor:move;display:flex;align-items:center;gap:8px;user-select:none;">' +
			`<span style="flex:1;">\u{1F4DC} Novidades \u2014 vers\u00E3o ${CENTRAL_VERSAO}</span>` +
			'<button id="cl-fechar" class="cop-jan-x">\u2716</button></div>' +
			'<div style="padding:12px 14px;overflow:auto;font-size:12.5px;color:#222;">' +
			CHANGELOG.map(([v, itens], i) =>
				'<div style="display:flex;gap:12px;padding:9px 0;' + (i ? 'border-top:1px solid #eee;' : '') + '">' +
				`<div style="flex:none;width:52px;font:700 12px/1.4 ui-monospace,Consolas,monospace;color:${i ? '#8a99a3' : '#3D7BD6'};">v${v}</div>` +
				`<div style="flex:1;color:${i ? '#444' : '#111'};line-height:1.5;">${itens.map(escHtml).join('<br>')}` +
				(i ? '' : ' <span style="background:#E8F0FE;color:#3D7BD6;border-radius:9px;padding:1px 7px;font-size:10px;font-weight:600;">atual</span>') +
				'</div></div>').join('') +
			'</div>';

		D.body.appendChild(modal);
		D.getElementById('cl-fechar').onclick = () => modal.remove();
		const h = D.getElementById('cl-header');
		h.onmousedown = (e) => {
			if (e.target.closest('button')) return;
			const sx = e.clientX - modal.getBoundingClientRect().left;
			const sy = e.clientY - modal.getBoundingClientRect().top;
			const mv = ev => { modal.style.left = (ev.pageX - sx) + 'px'; modal.style.top = (ev.pageY - sy) + 'px'; modal.style.transform = 'none'; };
			const up = () => { D.removeEventListener('mousemove', mv); D.removeEventListener('mouseup', up); };
			D.addEventListener('mousemove', mv); D.addEventListener('mouseup', up);
			e.preventDefault();
		};
	}

	/* Sensor com defeito confirmado na tecnologia:
	   libera a ocorr\u00EAncia por SENSOR_LIBERACAO_DIAS dias e monta o informativo
	   que vai para o grupo da transportadora e para o analista.                */
	/* A lista de alertas n\u00E3o traz a tecnologia. Procuramos primeiro no grid
	   aberto (instant\u00E2neo) e, se a placa n\u00E3o estiver na tela, montamos um
	   \u00EDndice a partir do grid da base \u2014 uma requisi\u00E7\u00E3o reaproveitada por
	   todas as consultas seguintes.                                          */
	function tecnologiaDaPlaca(placa) {
		try {
			const v = veiculosVisiveisNoGrid().find(v => v.placa === placa);
			if (v && v.tecnologia) return v.tecnologia;
		} catch (e) { }
		const idx = T.__acIdxTecnologia;
		return (idx && idx[String(placa || '').toUpperCase()]) || '';
	}

	// monta (uma vez) placa -> {tecnologia, cdVeiculo, cdProp, cliente} da base
	async function indiceDaBase(cdBase) {
		const base = cdBase || CD_BASE_SUPERVISAO;
		T.__acIdxBase = T.__acIdxBase || {};
		if (T.__acIdxBase[base]) return T.__acIdxBase[base];
		const idx = {};
		try {
			const todas = await buscarVeiculosDaBase(base);
			todas.forEach(v => {
				if (!v.placa) return;
				idx[v.placa.toUpperCase()] = v;
			});
			console.log('[GRID] \u00EDndice da base ' + base + ':', Object.keys(idx).length, 'placas');
		} catch (e) {
			console.warn('[GRID] n\u00E3o consegui montar o \u00EDndice da base:', e && e.message);
		}
		T.__acIdxBase[base] = idx;
		// atalho usado por tecnologiaDaPlaca
		T.__acIdxTecnologia = T.__acIdxTecnologia || {};
		Object.keys(idx).forEach(k => { if (idx[k].tecnologia) T.__acIdxTecnologia[k] = idx[k].tecnologia; });
		return idx;
	}

	/* Placa fora da base monitorada: buscamos no cadastro de ve\u00EDculos.
	   lista.php d\u00E1 o cd_veiculo (Clica(this,'...')) e acao.php traz
	   cd_tecnologia e cd_proprietario nos scripts de preenchimento.          */
	const URL_VEIC_LISTA = 'https://gerenciamento.griscargo.com.br/griscargo/cadastros/veiculos/lista.php';
	const URL_VEIC_ACAO  = 'https://gerenciamento.griscargo.com.br/griscargo/cadastros/veiculos/acao.php';
	// cd_tecnologia do cadastro -> nome usado nas tabelas de comando
	const TECNOLOGIA_POR_CODIGO = { '1': 'OMNILINK', '2': 'ONIX', '3': 'SASCAR', '4': 'SIGHRA', '5': 'AUTOTRAC' };

	async function buscarPlacaNoCadastro(placa) {
		const alvo = String(placa || '').toUpperCase().trim();
		if (!alvo) return null;
		T.__acCadVeic = T.__acCadVeic || {};
		if (T.__acCadVeic[alvo] !== undefined) return T.__acCadVeic[alvo];
		let dados = null;
		try {
			const html = await getTexto(`${URL_VEIC_LISTA}?TxPesquisa=${encodeURIComponent(alvo)}`);
			const doc = new DOMParser().parseFromString(html, 'text/html');
			let cdVeiculo = '', cliente = '', cdMct = '';
			doc.querySelectorAll('tr').forEach(tr => {
				if (cdVeiculo) return;
				const tds = tr.querySelectorAll('td');
				if (!tds.length) return;
				const p = (tds[0].textContent || '').replace(/\s+/g, ' ').trim().toUpperCase();
				if (p.replace(/-/g, '') !== alvo.replace(/-/g, '')) return;
				const m = (tr.getAttribute('onclick') || tr.innerHTML || '').match(/Clica\(\s*this\s*,\s*'(\d+)'/i);
				if (m) cdVeiculo = m[1];
				cdMct = (tds[1] && tds[1].textContent || '').trim();
				cliente = (tds[3] && tds[3].textContent || '').replace(/\s+/g, ' ').trim();
			});
			if (cdVeiculo) {
				dados = { placa: alvo, cdVeiculo: cdVeiculo, cdMct: cdMct, cliente: cliente, tecnologia: '', cdProp: '' };
				// segunda chamada: tecnologia e propriet\u00E1rio
				try {
					const det = await getTexto(`${URL_VEIC_ACAO}?Tipo=D&Codigo=${encodeURIComponent(cdVeiculo)}`);
					const mt = det.match(/#cd_tecnologia'\)\.val\('(\d+)'/);
					const mp = det.match(/#cd_proprietario'\)\.val\('(\d+)'/);
					if (mt) dados.tecnologia = TECNOLOGIA_POR_CODIGO[mt[1]] || ('COD' + mt[1]);
					if (mp) dados.cdProp = mp[1];
				} catch (e) { }
				console.log('[CADASTRO]', alvo, '\u2192 cd_veiculo', dados.cdVeiculo,
					'| tecnologia', dados.tecnologia || '?', '| propriet\u00E1rio', dados.cdProp || '?');
			}
		} catch (e) {
			console.warn('[CADASTRO] falha ao buscar', alvo, e && e.message);
		}
		T.__acCadVeic[alvo] = dados;
		return dados;
	}

	// dados completos da placa: tela primeiro, depois o \u00EDndice da base
	async function dadosDaPlaca(placa, cdBase) {
		const chave = String(placa || '').toUpperCase();
		try {
			const naTela = veiculosVisiveisNoGrid().find(v => v.placa === chave);
			if (naTela && naTela.tecnologia) return naTela;
		} catch (e) { }
		const idx = await indiceDaBase(cdBase);
		if (idx[chave]) return idx[chave];
		// fora da base monitorada: procura no cadastro de ve\u00EDculos
		return await buscarPlacaNoCadastro(chave);
	}

	/* "Autorizado por" tem uma lista propria por transportadora (ex.: CLIENTE
	   FRIBON). Buscamos as op\u00E7\u00F5es reais da placa e sorteamos uma, em vez de
	   assinar com o nome do operador.                                        */
	const URL_AUTORIZ_CAB = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/autorizacao/cabecalho.php';

	async function autorizadoresDaPlaca(cdVeiculo, placa) {
		T.__acAutorizCache = T.__acAutorizCache || {};
		if (T.__acAutorizCache[cdVeiculo]) return T.__acAutorizCache[cdVeiculo];
		let nomes = [];
		try {
			const url = `${URL_AUTORIZ_CAB}?cd_veiculo=${encodeURIComponent(cdVeiculo)}` +
				`&nr_placa=${encodeURIComponent(placa || '')}&dhxr${Date.now()}=1`;
			const html = await getTexto(url);
			const doc = new DOMParser().parseFromString(html, 'text/html');
			const sel = doc.getElementById('ds_autorizou') || doc.querySelector('[name="ds_autorizou"]');
			if (sel) {
				sel.querySelectorAll('option').forEach(o => {
					const t = (o.textContent || '').replace(/\s+/g, ' ').trim();
					if (t && !/^-\s*selecione\s*-$/i.test(t)) nomes.push(t);
				});
			}
		} catch (e) {
			console.warn('[AUTORIZ] n\u00E3o consegui ler os autorizadores:', e && e.message);
		}
		T.__acAutorizCache[cdVeiculo] = nomes;
		return nomes;
	}

	const sortear = lista => lista[Math.floor(Math.random() * lista.length)];

	async function liberarSensorDefeituoso(x, btn) {
		const cfg = x.cfg, p = x.placa;
		if (!p.tecnologia) p.tecnologia = tecnologiaDaPlaca(p.placa);
		if (!p.tecnologia) {
			// placa fora do grid aberto: busca no \u00EDndice da base
			if (btn) btn.textContent = '\u23F3';
			const d = await dadosDaPlaca(p.placa);
			if (d) {
				p.tecnologia = d.tecnologia || '';
				if (!p.cdVeiculo) p.cdVeiculo = d.cdVeiculo;
				if (!p.cliente) p.cliente = d.cliente;
			}
		}
		console.log('[VARREDURA] liberar:', p.placa,
			'| sensor:', JSON.stringify(cfg.sensor),
			'| tecnologia:', JSON.stringify(p.tecnologia),
			'| normalizada:', JSON.stringify(normalizarTecnologia(p.tecnologia)),
			'| cd_veiculo:', p.cdVeiculo,
			'| comando:', cmdSensor(p.tecnologia, cfg.sensor) || 'NENHUM');
		if (!cfg.cdTipo) { alert('Sensor sem tipo de autoriza\u00E7\u00E3o cadastrado: ' + cfg.rotulo); return; }

		const agora = new Date();
		const fim = new Date(agora.getTime() + SENSOR_LIBERACAO_DIAS * 24 * 3600000);
		const p2 = n => String(n).padStart(2, '0');
		const iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
		const br = d => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;

		const nomes = await autorizadoresDaPlaca(p.cdVeiculo, p.placa);
		const quem = nomes.length ? sortear(nomes) : (usuarioAtual() || 'MONITORAMENTO');
		if (!nomes.length) console.warn('[AUTORIZ] sem lista para', p.placa, '\u2014 assinando com o operador');
		const motivo = `Sensor ${cfg.rotulo} com defeito - verificado na tecnologia`;
		let cmdPrevisto = cmdSensor(p.tecnologia, cfg.sensor);
		if (!cmdPrevisto) {
			// sem comando: pode ser tecnologia n\u00E3o identificada ou escrita diferente
			const tecs = Object.keys(CMD_SENSOR).filter(t => CMD_SENSOR[t][cfg.sensor]);
			if (tecs.length) {
				const escolha = prompt(
					(p.tecnologia
						? `N\u00E3o achei o comando de ${cfg.rotulo} para "${p.tecnologia}".`
						: `N\u00E3o consegui identificar a tecnologia de ${p.placa}.`) +
					`\n\nQual \u00E9? (${tecs.join(' / ')})\n` +
					'Deixe em branco para liberar sem enviar o comando.',
					normalizarTecnologia(p.tecnologia) || tecs[0]);
				if (escolha === null) return;
				if ((escolha || '').trim()) {
					p.tecnologia = escolha.trim();
					cmdPrevisto = cmdSensor(p.tecnologia, cfg.sensor);
				}
			}
		}
		if (!confirm(`Liberar ${cfg.rotulo} da placa ${p.placa} por ${SENSOR_LIBERACAO_DIAS} dias?\n\n` +
			`De:  ${br(agora)}\nAt\u00E9: ${br(fim)}\n\nMotivo: ${motivo}\nAutorizado por: ${quem}\n\n` +
			(cmdPrevisto
				? `Ser\u00E1 enviado tamb\u00E9m o comando:\n${cmdPrevisto.label}\n`
				: `Sem comando de desabilitar cadastrado para ${p.tecnologia || 'esta tecnologia'}.\n`) +
			'\nA libera\u00E7\u00E3o ser\u00E1 anotada na placa.')) return;

		const original = btn ? btn.textContent : '';
		if (btn) { btn.disabled = true; btn.textContent = '\u23F3'; }
		try {
			const url = `${URL_ACOES_AJAX}?tp=autoriza_add&cd_veiculo=${encodeURIComponent(p.cdVeiculo)}` +
				`&ds_motivo=${escape(motivo).replace(/\+/g, '%2B')}&cd_tipo=${encodeURIComponent(cfg.cdTipo)}` +
				`&ds_autorizou=${escape(quem).replace(/\+/g, '%2B')}` +
				`&dt_ini=${iso(agora)}&dt_fim=${iso(fim)}&cd_cronico=0`;
			const res = await fetch(url, {
				headers: { "accept": "text/html,*/*;q=0.8", "accept-language": "pt-BR,pt;q=0.9" },
				method: "GET", mode: "cors", credentials: "include"
			});
			if (!res.ok) throw new Error('HTTP ' + res.status);
			x.liberado = { ate: br(fim) };

			// desabilita o sensor no rastreador, quando houver comando para a tecnologia
			const cmd = cmdSensor(p.tecnologia, cfg.sensor);
			if (cmd) {
				try {
					const desc = `1 - ${p.placa} (${p.tecnologia || ''})`;
					const filtro = `Comando: ${cmd.label} | Propriet\u00E1rio: ${p.cliente || ''}`;
					const urlCmd = `${URL_CMD_ACAO}?tp=E&veiculos=${encodeURIComponent(p.cdVeiculo)}` +
						`&cd_comando=${encodeURIComponent(cmd.cd)}` +
						`&filtro=${encodeURIComponent(filtro)}&ds_veiculos=${encodeURIComponent(desc)}`;
					const resp = await getTexto(urlCmd);
					x.cmdEnviado = /Envio Realizado com sucesso/i.test(resp) ? 'ok' : 'sem confirma\u00E7\u00E3o';
					console.log('[VARREDURA] comando enviado:', cmd.label, '\u2192', x.cmdEnviado);
				} catch (eCmd) {
					x.cmdEnviado = 'falhou';
					console.error('[VARREDURA] falha no comando do sensor:', eCmd);
				}
			} else {
				x.cmdEnviado = 'sem comando';
				console.log('[VARREDURA] sem comando cadastrado para', p.tecnologia, '/', cfg.sensor);
			}

			// registra na placa o sensor, o per\u00EDodo e o motivo da libera\u00E7\u00E3o
			try {
				const anot = `Sensor ${cfg.rotulo} liberado de ${br(agora)} a ${br(fim)} ` +
					`(${SENSOR_LIBERACAO_DIAS} dias). Sensor com defeito - verificado na tecnologia.`;
				await enviarComentarioVeiculo(anot, p.cdVeiculo);
				console.log('[VARREDURA] anota\u00E7\u00E3o registrada:', anot);
			} catch (eAnot) {
				console.error('[VARREDURA] falha ao anotar na placa:', eAnot);
			}

			if (btn) { btn.textContent = '\u2714 liberado'; btn.style.color = '#2e7d32'; }
			console.log('[VARREDURA] sensor liberado:', p.placa, cfg.rotulo, 'at\u00E9', br(fim));
			const resumoCmd = x.cmdEnviado === 'ok' ? `\nComando enviado: ${cmd.label}`
				: (x.cmdEnviado === 'sem comando'
					? `\n\u26A0 Sem comando para "${p.tecnologia || '(tecnologia n\u00E3o identificada)'}" + "${cfg.sensor}".` +
					  '\nDesabilite o sensor manualmente pela tela de comandos.'
					: `\n\u26A0 Comando ${x.cmdEnviado} \u2014 confira no portal`);
			if (confirm(`\u2714 ${cfg.rotulo} liberado at\u00E9 ${br(fim)}.${resumoCmd}\n\nGerar o informativo para o grupo e o analista?`))
				informativoSensorDefeituoso(x);
		} catch (e) {
			console.error('[VARREDURA] falha ao liberar:', e);
			alert('N\u00E3o consegui registrar a libera\u00E7\u00E3o. Veja o console (F12).');
			if (btn) { btn.disabled = false; btn.textContent = original; }
		}
	}

	function informativoSensorDefeituoso(x) {
		const cfg = x.cfg, p = x.placa;

		const texto =
			`SENSOR COM DEFEITO\n\n` +
			`Placa: ${p.placa}\n` +
			`Transportadora: ${p.cliente || '\u2014'}\n` +
			`Sensor: ${cfg.rotulo}\n\n` +
			`O sensor est\u00E1 alarmando constantemente h\u00E1 mais de ${SENSOR_LIBERACAO_DIAS} dias.`;

		copiarSilencioso(texto).then(() => {
			alert('Informativo do sensor copiado para a \u00E1rea de transfer\u00EAncia \u2714\n\n' + texto);
		}).catch(() => {
			// se a c\u00F3pia falhar, mostra o texto para o operador copiar \u00E0 m\u00E3o
			prompt('Copie o informativo abaixo:', texto.replace(/\n/g, ' | '));
		});
	}

	function abrirVarreduraSensores() {
		D.getElementById('modal-varredura-sensores')?.remove();

		const modal = D.createElement('div');
		modal.id = 'modal-varredura-sensores';
		modal.style.cssText =
			'position:fixed;top:5%;left:50%;transform:translateX(-50%);width:980px;max-width:97vw;' +
			'max-height:90vh;overflow:hidden;background:#fff;z-index:2147483000;' +
			'display:flex;flex-direction:column;' +
			'';
		modal.classList.add('cop-jan');
		estiloJanelas();

		const checksSensores = SENSORES_VARREDURA.map((s, i) =>
			`<label style="display:flex;align-items:center;gap:3px;cursor:pointer;white-space:nowrap;">` +
			`<input type="checkbox" class="var-sens" value="${i}" checked> ${escHtml(s.rotulo)}</label>`
		).join('');
		modal.innerHTML = `
			<div id="var-header" class="cop-jan-head" style="--cop-acento:#E65100;cursor:move;display:flex;align-items:center;gap:8px;user-select:none;">
				<span style="flex:1;">\u{1F50E} Varredura de Sensores Defeituosos</span>
				<button id="var-fechar" class="cop-jan-x">\u2716</button>
			</div>
			<div style="padding:8px 12px;border-bottom:1px solid #ddd;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;background:#fafafa;">
				<b>Sensores:</b>
				<label style="display:flex;align-items:center;gap:3px;cursor:pointer;white-space:nowrap;border-right:1px solid #ccc;padding-right:10px;">
					<input type="checkbox" id="var-todos" checked> <b>Todos</b>
				</label>
				${checksSensores}
				<label style="display:flex;align-items:center;gap:4px;">Viagem:
					<select id="var-situacao" style="padding:3px 6px;border:1px solid #ccc;border-radius:4px;">
						<option value="1" selected>Com viagem</option>
						<option value="2">Sem viagem</option>
						<option value="">Todas</option>
					</select>
				</label>
				<label style="display:flex;align-items:center;gap:4px;">Base:
					<select id="var-base" style="padding:3px 6px;border:1px solid #ccc;border-radius:4px;">
						<option value="34" selected>Base 2</option>
						<option value="33">Base 1</option>
						<option value="26">Base Gral</option>
					</select>
				</label>
				<button id="var-iniciar" style="background:#E65100;color:#fff;border:none;border-radius:6px;padding:6px 16px;font-weight:bold;cursor:pointer;margin-left:auto;">\u25B6 Iniciar varredura</button>
				<button id="var-copiar" style="display:none;background:#455A64;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;">\u{1F4CB} Copiar suspeitas</button>
			</div>
			<div id="var-corpo" style="padding:10px 12px;overflow:auto;font-size:12px;color:#222;flex:1;">
				A varredura busca as placas com essas ocorr\u00EAncias e mede, nas \u00FAltimas ${VARREDURA_JANELA_H}h, por quanto tempo
				o sensor ficou <b>alarmando</b>. A janela \u00E9 dividida em ${VARREDURA_BLOCOS} blocos isolados
				(~${Math.round(VARREDURA_JANELA_H / VARREDURA_BLOCOS)}h cada) e at\u00E9 ${VARREDURA_EVT_BLOCO} eventos de cada bloco s\u00E3o verificados.
				Acusa poss\u00EDvel defeito quando o alarme foi constante (\u2265 ${VARREDURA_PCT_MIN}% dos eventos ativos,
				espalhados pelos blocos; pequenos intervalos de minutos s\u00E3o tolerados) por pelo menos ~24h
				<b>ou</b> cobrindo praticamente todo o hist\u00F3rico m\u00E1ximo que o sistema consegue puxar da
				tecnologia (teto medido a cada varredura). Alarmes curtos dentro de um hist\u00F3rico maior
				n\u00E3o s\u00E3o acusados; a confirma\u00E7\u00E3o \u00E9 sempre na tecnologia, que mostra o hist\u00F3rico completo.
			</div>`;

		D.body.appendChild(modal);
		D.getElementById('var-fechar').onclick = () => modal.remove();

		const header = D.getElementById('var-header');
		header.onmousedown = (e) => {
			if (e.target.closest('button')) return;
			const sx = e.clientX - modal.getBoundingClientRect().left;
			const sy = e.clientY - modal.getBoundingClientRect().top;
			const mv = ev => { modal.style.left = (ev.pageX - sx) + 'px'; modal.style.top = (ev.pageY - sy) + 'px'; modal.style.transform = 'none'; };
			const up = () => { D.removeEventListener('mousemove', mv); D.removeEventListener('mouseup', up); };
			D.addEventListener('mousemove', mv); D.addEventListener('mouseup', up);
			e.preventDefault();
		};

		let suspeitasTexto = '';

		// sincroniza o "Todos" com os checkboxes individuais
		const cbTodos = D.getElementById('var-todos');
		const cbsSens = () => Array.from(modal.querySelectorAll('.var-sens'));
		cbTodos.onchange = () => { cbsSens().forEach(cb => { cb.checked = cbTodos.checked; }); };
		cbsSens().forEach(cb => {
			cb.onchange = () => { cbTodos.checked = cbsSens().every(c => c.checked); };
		});

		D.getElementById('var-iniciar').onclick = executar;
		D.getElementById('var-copiar').onclick = function () {
			if (suspeitasTexto) copiar(suspeitasTexto, this, '\u{1F4CB} Copiar suspeitas');
		};

		async function executar() {
			const corpo = D.getElementById('var-corpo');
			const btn = D.getElementById('var-iniciar');
			const btnCop = D.getElementById('var-copiar');
			btn.disabled = true;
			btnCop.style.display = 'none';
			const resultados = [];

			// varre apenas os sensores marcados
			const selecionados = Array.from(modal.querySelectorAll('.var-sens:checked'))
				.map(cb => SENSORES_VARREDURA[parseInt(cb.value, 10)])
				.filter(Boolean);
			if (!selecionados.length) {
				alert('Selecione pelo menos um sensor para a varredura.');
				btn.disabled = false;
				return;
			}

			try {
				for (const cfg of selecionados) {
					corpo.innerHTML = `\u23F3 Coletando placas com <b>${escHtml(cfg.rotulo)}</b> (abertas e reagendadas)...`;

					const cdBase = D.getElementById('var-base')?.value || CD_BASE_SUPERVISAO;
					const cdSituacao = D.getElementById('var-situacao') ? D.getElementById('var-situacao').value : '1';
					const [abertas, reag] = await Promise.all([
						buscarPlacasSupervisao(URL_SUP_ABERTOS, cfg.info, 'aberto', cdBase, cdSituacao).catch(() => []),
						buscarPlacasSupervisao(URL_SUP_REAG, cfg.info, 'reagendado', cdBase, cdSituacao).catch(() => [])
					]);

					// une por cd_veiculo (fonte vira "aberto+reagendado" quando nas duas)
					const porVeiculo = {};
					abertas.concat(reag).forEach(p => {
						if (!porVeiculo[p.cdVeiculo]) porVeiculo[p.cdVeiculo] = p;
						else if (porVeiculo[p.cdVeiculo].fonte !== p.fonte) porVeiculo[p.cdVeiculo].fonte = 'aberto+reagendado';
					});
					const placas = Object.values(porVeiculo);

					if (!placas.length) {
						resultados.push({ cfg: cfg, placa: null });
						continue;
					}

					for (let i = 0; i < placas.length; i++) {
						const p = placas[i];
						const prefixo = `\u23F3 <b>${escHtml(cfg.rotulo)}</b> \u2014 analisando ${escHtml(p.placa)} (${i + 1}/${placas.length})`;
						corpo.innerHTML = prefixo + '...';
						try {
							const r = await analisarSensorPlaca(p.cdVeiculo, cfg.sensor, (d, t) => {
								corpo.innerHTML = `${prefixo} \u2014 eventos ${d}/${t}`;
							});
							resultados.push({ cfg: cfg, placa: p, r: r });
						} catch (e) {
							console.error('[VARREDURA] erro em', p.placa, e);
							resultados.push({ cfg: cfg, placa: p, r: { status: 'erro', eventos: 0, amostrados: 0, ativos: 0, pct: 0, spanH: 0 } });
						}
					}
				}

				T.__acVarrUltima = resultados;
				renderResultados(resultados);
			} catch (e) {
				console.error('[VARREDURA] erro geral:', e);
				corpo.innerHTML = '<div style="padding:10px;color:#b22222;">Erro na varredura. Veja o console (F12).</div>';
			} finally {
				btn.disabled = false;
			}
		}

		function renderResultados(resultados) {
			const corpo = D.getElementById('var-corpo');
			const btnCop = D.getElementById('var-copiar');

			// teto de historico da RODADA: o maior span de eventos que o sistema
			// devolveu entre as placas (base dinamica p/ o criterio de saturacao)
			const spans = resultados.filter(x => x.placa && x.r).map(x => x.r.spanH || 0);
			const tetoH = spans.length ? Math.max.apply(null, spans) : 0;
			resultados.forEach(x => {
				if (x.placa && x.r && x.r.status === 'avaliar') classificarVarredura(x.r, tetoH);
			});

			// marca\u00E7\u00E3o do operador: n\u00E3o \u00E9 defeito (conferido na tecnologia)
			resultados.forEach(x => {
				if (!x.placa) return;
				x.fp = fpAtivo(x.placa.placa, x.cfg.rotulo);
			});

			const ordem = { 'defeito': 0, 'intermitente': 1, 'ok': 2, 'insuficiente': 3, 'sem-eventos': 4, 'sensor-inexistente': 5, 'erro': 6 };
			const ordemDe = x => x.fp ? 9 : ordem[x.r.status];   // marcados v\u00E3o para o fim
			const linhas = resultados.filter(x => x.placa).sort((a, b) =>
				(ordemDe(a) - ordemDe(b)) || b.r.pct - a.r.pct || a.placa.placa.localeCompare(b.placa.placa));
			const marcados = linhas.filter(x => x.fp).length;

			const semPlacas = resultados.filter(x => !x.placa).map(x => x.cfg.rotulo);

			if (!linhas.length) {
				corpo.innerHTML = '<div style="padding:12px;color:#2e7d32;">\u2714 Nenhuma placa com ' +
					escHtml(semPlacas.join(', ') || 'as ocorr\u00EAncias verificadas') + ' em aberto/reagendada no momento.</div>';
				return;
			}

			const situacao = r => {
				if (r.manual) return '<span style="color:#AD1457;font-weight:bold;">\u{1F527} Defeito confirmado pelo operador</span>';
				if (r.status === 'defeito') {
					if (r.spanAtivoH >= VARREDURA_SPAN_MIN_H)
						return '<span style="color:#b71c1c;font-weight:bold;">\u{1F534} Poss\u00EDvel defeito do sensor \u2014 verificar na tecnologia para confirmar</span>';
					if (r.saturado)
						return `<span style="color:#b71c1c;font-weight:bold;">\u{1F534} Poss\u00EDvel defeito do sensor \u2014 alarme cobre todo o hist\u00F3rico que o sistema puxa (${r.spanAtivoH}h) \u2014 verificar na tecnologia para confirmar</span>`;
					return `<span style="color:#b71c1c;font-weight:bold;">\u{1F534} Poss\u00EDvel defeito do sensor (alarme registrado por apenas ${r.spanAtivoH}h) \u2014 verificar na tecnologia para confirmar</span>`;
				}
				if (r.status === 'intermitente') {
					return `<span style="color:#b26a00;font-weight:bold;">\u{1F7E1} Sensor intermitente (${r.pct}% ativo por ${r.spanAtivoH}h) \u2014 avaliar: poss\u00EDvel mau contato</span>`;
				}
				if (r.status === 'ok') {
					// explica o motivo de nao ter acusado
					if (r.pct >= VARREDURA_PCT_MIN && r.spanAtivoH > 0 && r.spanAtivoH < VARREDURA_SPAN_MIN_CURTO_H)
						return `<span style="color:#2e7d32;">\u{1F7E2} Sem padr\u00E3o de defeito (constante, mas o alarme durou s\u00F3 ${r.spanAtivoH}h)</span>`;
					if (r.pct >= VARREDURA_PCT_MIN)
						return `<span style="color:#2e7d32;">\u{1F7E2} Sem padr\u00E3o de defeito (ativa\u00E7\u00F5es concentradas em ${r.blocosAtivos} bloco(s) \u2014 picos isolados)</span>`;
					if (r.pct >= VARREDURA_PCT_INTERM && r.spanAtivoH > 0 && r.spanAtivoH < VARREDURA_SPAN_MIN_CURTO_H)
						return `<span style="color:#2e7d32;">\u{1F7E2} Sem padr\u00E3o de defeito (intermitente por apenas ${r.spanAtivoH}h)</span>`;
					return `<span style="color:#2e7d32;">\u{1F7E2} Sem padr\u00E3o de defeito (${r.pct}% ativo)</span>`;
				}
				if (r.status === 'insuficiente') return '<span style="color:#777;">\u26AA Poucos eventos para concluir</span>';
				if (r.status === 'sem-eventos') return `<span style="color:#777;">\u26AA Sem eventos nas \u00FAltimas ${VARREDURA_JANELA_H}h</span>`;
				if (r.status === 'sensor-inexistente') return '<span style="color:#777;">\u26AA Sensor n\u00E3o reportado pelo rastreador</span>';
				return '<span style="color:#b22222;">Erro na an\u00E1lise</span>';
			};

			let html =
				`<div style="margin-bottom:6px;color:#555;">Hist\u00F3rico m\u00E1ximo que o sistema devolveu nesta varredura: <b>${tetoH ? tetoH.toFixed(1) + 'h' : '\u2014'}</b> \u2014 alarmes constantes cobrindo \u2265 ${Math.round(VARREDURA_SATURACAO * 100)}% disso s\u00E3o acusados.</div>` +
				(marcados
					? `<div style="margin-bottom:6px;color:#555;">\u2705 <b>${marcados}</b> marcada(s) como <b>falso positivo</b> (conferidas na tecnologia) \u2014 saem das suspeitas por ${VARREDURA_FP_DIAS} dias. ` +
					  '<a href="#" id="var-fp-limpar" style="color:#1565C0;">limpar todas</a></div>'
					: '') +
				'<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
				'<thead><tr style="background:#f5f5f5;text-align:left;">' +
				'<th style="padding:6px;border-bottom:1px solid #ccc;">Placa</th>' +
				'<th style="padding:6px;border-bottom:1px solid #ccc;">Cliente</th>' +
				'<th style="padding:6px;border-bottom:1px solid #ccc;">Sensor</th>' +
				'<th style="padding:6px;border-bottom:1px solid #ccc;">Fonte</th>' +
				`<th style="padding:6px;border-bottom:1px solid #ccc;">Eventos ${VARREDURA_JANELA_H}h</th>` +
				'<th style="padding:6px;border-bottom:1px solid #ccc;">Ativo</th>' +
				'<th style="padding:6px;border-bottom:1px solid #ccc;">Alarme ativo por</th>' +
				'<th style="padding:6px;border-bottom:1px solid #ccc;">Situa\u00E7\u00E3o</th>' +
				'<th style="padding:6px;border-bottom:1px solid #ccc;"></th>' +
				'</tr></thead><tbody>';

			const suspeitas = [];
			linhas.forEach((x, idx) => {
				const r = x.r;
				if (x.fp) {                       // conferido: fora das suspeitas
					html += '<tr style="border-bottom:1px solid #eee;color:#9aa;">' +
						`<td style="padding:6px;font-weight:bold;">${escHtml(x.placa.placa)}</td>` +
						`<td style="padding:6px;">${escHtml(x.placa.cliente || '\u2014')}</td>` +
						`<td style="padding:6px;">${escHtml(x.cfg.rotulo)}</td>` +
						`<td style="padding:6px;">${escHtml(x.placa.fonte)}</td>` +
						`<td style="padding:6px;">${r.eventos}</td>` +
						`<td style="padding:6px;white-space:nowrap;">${r.amostrados ? r.ativos + '/' + r.amostrados + ' (' + r.pct + '%)' : '\u2014'}</td>` +
						`<td style="padding:6px;white-space:nowrap;">${r.spanAtivoH ? r.spanAtivoH + 'h' : '\u2014'}</td>` +
						`<td style="padding:6px;"><span style="color:#2e7d32;">\u2705 Falso positivo \u2014 conferido em ${escHtml(x.fp.quando)}</span></td>` +
						`<td style="padding:6px;"><button data-fp-off="${idx}" style="background:transparent;border:1px solid #ccc;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;color:#555;">\u21BA Desmarcar</button></td>` +
						'</tr>';
					return;
				}
				if (r.status === 'defeito') {
					const extra = r.saturado ? ' \u2014 cobre todo o hist\u00F3rico que o sistema puxa' : '';
					suspeitas.push(`${x.placa.placa} \u2014 ${x.cfg.rotulo} alarmando ha ${r.spanAtivoH}h${extra} (${r.pct}% dos eventos, ${r.blocosAtivos}/${r.blocosVerif} blocos) (poss\u00EDvel defeito \u2014 verificar na tecnologia)`);
				} else if (r.status === 'intermitente') {
					suspeitas.push(`${x.placa.placa} \u2014 ${x.cfg.rotulo} intermitente ha ${r.spanAtivoH}h (${r.pct}% dos eventos ativos) (avaliar \u2014 poss\u00EDvel mau contato)`);
				}
				const fundo = r.status === 'defeito' ? 'background:#fff3f3;'
					: (r.status === 'intermitente' ? 'background:#fffde7;' : '');
				html += '<tr style="border-bottom:1px solid #eee;' + fundo + '">' +
					`<td style="padding:6px;font-weight:bold;">${escHtml(x.placa.placa)}</td>` +
					`<td style="padding:6px;">${escHtml(x.placa.cliente || '\u2014')}</td>` +
					`<td style="padding:6px;">${escHtml(x.cfg.rotulo)}</td>` +
					`<td style="padding:6px;">${escHtml(x.placa.fonte)}</td>` +
					`<td style="padding:6px;">${r.eventos}</td>` +
					`<td style="padding:6px;white-space:nowrap;">${r.amostrados ? r.ativos + '/' + r.amostrados + ' (' + r.pct + '%) \u2014 blocos ' + r.blocosAtivos + '/' + r.blocosVerif : '\u2014'}</td>` +
					`<td style="padding:6px;white-space:nowrap;">${r.spanAtivoH ? r.spanAtivoH + 'h' : '\u2014'}</td>` +
					`<td style="padding:6px;">${situacao(r)}</td>` +
					`<td style="padding:6px;white-space:nowrap;">${(r.status === 'defeito' || r.status === 'intermitente')
						? `<button data-fp-on="${idx}" title="Conferi na tecnologia: n\u00E3o \u00E9 defeito" style="background:transparent;border:1px solid #cfd8dc;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;color:#2e7d32;">\u2705 N\u00E3o \u00E9 defeito</button>` +
						  ` <button data-lib="${idx}" title="Defeito confirmado: liberar o sensor por ${SENSOR_LIBERACAO_DIAS} dias" style="background:transparent;border:1px solid #cfd8dc;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;color:#b26a00;">\u{1F513} Liberar ${SENSOR_LIBERACAO_DIAS}d</button>` +
						  ` <button data-inf="${idx}" title="Gerar informativo do sensor com defeito" style="background:transparent;border:1px solid #cfd8dc;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;color:#1565C0;">\u{1F4CB} Informativo</button>`
						: (r.status !== 'sensor-inexistente' && r.status !== 'erro'
							? `<button data-def-on="${idx}" title="Conferi na tecnologia: est\u00E1 com defeito, mesmo sem o padr\u00E3o" style="background:transparent;border:1px solid #e0a0b8;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;color:#AD1457;">\u{1F527} Marcar defeito</button>`
							: '')}</td>` +
					'</tr>';
			});
			html += '</tbody></table>';

			if (semPlacas.length) {
				html += `<div style="margin-top:8px;color:#777;">Sem placas em aberto/reagendadas para: ${escHtml(semPlacas.join(', '))}.</div>`;
			}

			corpo.innerHTML = html;

			corpo.querySelectorAll('[data-def-on]').forEach(b => {
				b.onclick = () => {
					const x = linhas[parseInt(b.dataset.defOn, 10)];
					if (!confirm(`Marcar ${x.placa.placa} \u2014 ${x.cfg.rotulo} como defeituoso?\n\n` +
						'A varredura n\u00E3o acusou o padr\u00E3o, mas voc\u00EA conferiu na tecnologia.\n' +
						'A linha passa a ter as op\u00E7\u00F5es de liberar e gerar informativo.')) return;
					x.r.status = 'defeito';
					x.r.manual = true;                               // marca\u00E7\u00E3o do operador
					fpMarcar(x.placa.placa, x.cfg.rotulo, false);    // sai de falso positivo, se estava
					renderResultados(T.__acVarrUltima || resultados);
				};
			});
			corpo.querySelectorAll('[data-fp-on]').forEach(b => {
				b.onclick = () => {
					const x = linhas[parseInt(b.dataset.fpOn, 10)];
					if (!confirm(`Marcar ${x.placa.placa} \u2014 ${x.cfg.rotulo} como falso positivo?\n\n` +
						`Some das suspeitas por ${VARREDURA_FP_DIAS} dias. Use ap\u00F3s conferir na tecnologia que o sensor est\u00E1 bom.`)) return;
					fpMarcar(x.placa.placa, x.cfg.rotulo, true);
					renderResultados(T.__acVarrUltima || resultados);
				};
			});
			corpo.querySelectorAll('[data-lib]').forEach(b => {
				b.onclick = () => liberarSensorDefeituoso(linhas[parseInt(b.dataset.lib, 10)], b);
			});
			corpo.querySelectorAll('[data-inf]').forEach(b => {
				b.onclick = () => informativoSensorDefeituoso(linhas[parseInt(b.dataset.inf, 10)]);
			});
			corpo.querySelectorAll('[data-fp-off]').forEach(b => {
				b.onclick = () => {
					const x = linhas[parseInt(b.dataset.fpOff, 10)];
					fpMarcar(x.placa.placa, x.cfg.rotulo, false);
					renderResultados(T.__acVarrUltima || resultados);
				};
			});
			const limpar = D.getElementById('var-fp-limpar');
			if (limpar) limpar.onclick = (ev) => {
				ev.preventDefault();
				if (!confirm('Limpar todas as marca\u00E7\u00F5es de falso positivo?')) return;
				T.__acFP = {}; fpGravar();
				renderResultados(T.__acVarrUltima || resultados);
			};

			suspeitasTexto = suspeitas.join('\n');
			btnCop.style.display = suspeitas.length ? '' : 'none';
		}
	}

	/* =========================================================
	   3g. REGRAS DA FROTA (manual de procedimentos)
	   ========================================================= */
	function abrirRegrasFrota() {
		D.getElementById('modal-regras-frota')?.remove();

		// tenta pre-selecionar a frota da placa selecionada no grid
		let fSel = null, placaSel = '';
		try {
			const dados = extrairDadosDaLinhaSelecionada();
			if (dados && dados.cliente) { fSel = detectarFrota(dados.cliente); placaSel = dados.placa || ''; }
		} catch (e) {}

		const modal = D.createElement('div');
		modal.id = 'modal-regras-frota';
		modal.style.cssText =
			'position:fixed;top:8%;left:50%;transform:translateX(-50%);width:640px;max-width:95vw;' +
			'max-height:84vh;overflow:hidden;background:#fff;z-index:2147483000;' +
			'display:flex;flex-direction:column;' +
			'';
		modal.classList.add('cop-jan');
		estiloJanelas();

		const options = REGRAS_FROTAS.map((f, i) =>
			`<option value="${i}" ${fSel === f ? 'selected' : ''}>${escHtml(f.nome)}</option>`).join('');

		modal.innerHTML = `
			<div id="rf-header" class="cop-jan-head" style="--cop-acento:#5D4037;cursor:move;display:flex;align-items:center;gap:8px;user-select:none;">
				<span style="flex:1;">\u{1F4D6} Regras da Frota${placaSel && fSel ? ' \u2014 ' + escHtml(placaSel) : ''}</span>
				<button id="rf-fechar" class="cop-jan-x">\u2716</button>
			</div>
			<div style="padding:8px 12px;border-bottom:1px solid #ddd;display:flex;align-items:center;gap:8px;font-size:12px;background:#fafafa;">
				<label>Frota:
					<select id="rf-frota" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;min-width:260px;">
						${fSel ? '' : '<option value="" selected>\u2014 selecione \u2014</option>'}${options}
					</select>
				</label>
				${(!fSel && placaSel) ? `<span style="color:#b26a00;">Frota da placa ${escHtml(placaSel)} n\u00E3o mapeada no manual.</span>` : ''}
			</div>
			<div id="rf-corpo" style="padding:12px;overflow:auto;font-size:13px;color:#222;flex:1;">
				Selecione a frota para ver as regras.
			</div>`;

		D.body.appendChild(modal);
		D.getElementById('rf-fechar').onclick = () => modal.remove();

		const header = D.getElementById('rf-header');
		header.onmousedown = (e) => {
			if (e.target.closest('button')) return;
			const sx = e.clientX - modal.getBoundingClientRect().left;
			const sy = e.clientY - modal.getBoundingClientRect().top;
			const mv = ev => { modal.style.left = (ev.pageX - sx) + 'px'; modal.style.top = (ev.pageY - sy) + 'px'; modal.style.transform = 'none'; };
			const up = () => { D.removeEventListener('mousemove', mv); D.removeEventListener('mouseup', up); };
			D.addEventListener('mousemove', mv); D.addEventListener('mouseup', up);
			e.preventDefault();
		};

		function linha(rotulo, valor, cor) {
			if (!valor) return '';
			return `<div style="margin-bottom:8px;"><div style="font-size:11px;font-weight:bold;color:${cor || '#5D4037'};text-transform:uppercase;">${rotulo}</div>` +
				`<div style="color:#222;">${escHtml(valor)}</div></div>`;
		}

		function render() {
			const corpo = D.getElementById('rf-corpo');
			const idx = D.getElementById('rf-frota').value;
			if (idx === '') { corpo.innerHTML = 'Selecione a frota para ver as regras.'; return; }
			const f = REGRAS_FROTAS[parseInt(idx, 10)];
			if (!f) { corpo.innerHTML = ''; return; }

			let alertasHtml = '';
			if (f.alertas && f.alertas.length) {
				alertasHtml = '<div style="margin-bottom:8px;"><div style="font-size:11px;font-weight:bold;color:#b71c1c;text-transform:uppercase;">\u26A0 Alertas</div>' +
					f.alertas.map(a => `<div style="background:#fff3f3;border:1px solid #f3c1c1;border-radius:5px;padding:5px 8px;margin-top:4px;color:#7a1010;">${escHtml(a)}</div>`).join('') +
					'</div>';
			}

			corpo.innerHTML =
				`<div style="font-weight:bold;font-size:15px;color:#3E2723;margin-bottom:10px;">${escHtml(f.nome)}</div>` +
				linha('Bloqueio', f.bloqueio) +
				linha('Hor\u00E1rio', f.horario) +
				alertasHtml +
				linha('Condutor', f.condutorDescr, '#1565C0') +
				linha('Sinistro', f.sinistro, '#b71c1c');
		}

		D.getElementById('rf-frota').onchange = render;
		render();
	}

	/* =========================================================
	   3d. PAINEL "TRATAR OCORRENCIAS" (lista.php + passos)
	   ========================================================= */
	// interpreta o lista.php: ocorrencias + passo atual + reagendar
	function parseListaOcorrencias(html) {
		const cdClifor = (html.match(/id="cd_clifor"[^>]*value="([^"]*)"/i) || [])[1] || '';
		const dtReag   = (html.match(/id="dt_reag"[^>]*value="([^"]*)"/i) || [])[1] || '';
		const ocorrencias = [];
		const reTr = /<tr[^>]*\bid="a\d+"[^>]*>([\s\S]*?)<\/tr>/gi;
		let mt;
		while ((mt = reTr.exec(html)) !== null) {
			const bloco = mt[0];
			const mClica = bloco.match(/clica\(this,\s*'([^']*)'\s*,\s*'([^']*)'/i);
			const cdAtua = mClica ? mClica[1] : '';
			const cdProcesso = mClica ? mClica[2] : '';
			const mMap = bloco.match(/map\(\s*\d+\s*,\s*\d+\s*,\s*'[^']*'\s*,\s*'([^']*)'/i);
			const cdEvento = mMap ? mMap[1] : '';
			const mB = bloco.match(/baixarPasso\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
			const acao = mB ? mB[1] : '';
			const cdMotorista = mB ? mB[3] : '';
			const mLbl = bloco.match(/value="([^"]*)"[^>]*baixarPasso/i);
			const passoLabel = mLbl ? mLbl[1] : '';
			// numero do passo no plano (o rotulo comeca com ele: "7 FORMALIZAR...")
			const mNum = passoLabel.match(/^\s*(\d+)\b/);
			const numeroPasso = mNum ? parseInt(mNum[1], 10) : null;
			const reagendar = /reagenda\(/i.test(bloco);
			// reagenda(this, cd_atua, cd_veiculo, cd_evento) -> fonte direta p/ reagendar
			const mR = bloco.match(/reagenda\(\s*this\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'/i);
			const cdAtuaFinal   = (reagendar && mR && mR[1]) ? mR[1] : cdAtua;
			const cdEventoFinal = (reagendar && mR && mR[3]) ? mR[3] : cdEvento;
			const tds = [];
			let mtd; const reTd = /<td[^>]*>([\s\S]*?)<\/td>/gi;
			while ((mtd = reTd.exec(bloco)) !== null) tds.push(mtd[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
			ocorrencias.push({
				cdAtua: cdAtuaFinal, cdEvento: cdEventoFinal, acao: acao, cdMotorista: cdMotorista,
				cdProcesso: cdProcesso, numeroPasso: numeroPasso,
				reagendar: reagendar, passoLabel: passoLabel,
				geracao: tds[1] || '', alerta: tds[3] || '', status: tds[4] || ''
			});
		}
		return { cdClifor: cdClifor, dtReag: dtReag, ocorrencias: ocorrencias };
	}

	// plano de passos da ocorrencia (timeline do detalhes.php):
	// [{titulo, status ('auto'|'pendente'|...), data, meta}]
	async function buscarPlanoPassos(cdAtua, cdProcesso, cdClifor) {
		const url = `${URL_ATUACAO_DET}?id=${encodeURIComponent(cdAtua)}&cd_processo=${encodeURIComponent(cdProcesso)}&cd_clifor=${encodeURIComponent(cdClifor)}`;
		const res = await fetch(url, {
			headers: {
				"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
				"upgrade-insecure-requests": "1"
			},
			method: "GET", mode: "cors", credentials: "include"
		});
		const buf = await res.arrayBuffer();
		const html = new TextDecoder('windows-1252').decode(buf);

		const passos = [];
		try {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			doc.querySelectorAll('tr').forEach(tr => {
				const topo = tr.querySelector('.tl-card-topo');
				if (!topo) return;
				const st = ((tr.className || '').match(/st-([\w-]+)/) || [])[1] || '';
				const dataB = tr.querySelector('.tl-data b');
				const meta = tr.querySelector('.tl-meta');
				passos.push({
					titulo: (topo.textContent || '').replace(/\s+/g, ' ').trim(),
					status: st,
					data: dataB ? (dataB.textContent || '').trim() : '',
					meta: meta ? (meta.textContent || '').replace(/\s+/g, ' ').trim() : ''
				});
			});
		} catch (e) {}
		return passos;
	}

	// HTML compacto do plano para o card da ocorrencia
	function htmlPlanoPassos(passos) {
		if (!passos || !passos.length) return '';
		let achouPendente = false;
		const linhas = passos.map(p => {
			const pend = /pendente/i.test(p.status) || /^PENDENTE$/i.test(p.data);
			const atual = pend && !achouPendente;
			if (pend) achouPendente = true;
			const ic  = pend ? (atual ? '\u25B6' : '\u25CB') : '\u2714';
			const cor = atual ? '#00695C' : (pend ? '#9e9e9e' : '#7a7a7a');
			const peso = atual ? 'bold' : 'normal';
			const hora = (!pend && /\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/.test(p.data)) ? ` <span style="color:#b5b5b5;">(${p.data.slice(11, 16)})</span>` : '';
			return `<div style="font-size:11px;color:${cor};font-weight:${peso};margin:1px 0;line-height:1.35;" title="${escAttr(p.meta)}">${ic} ${escHtml(p.titulo)}${hora}</div>`;
		});
		return `<div style="margin:2px 0 8px;border-left:3px solid #e0e0e0;padding-left:8px;">${linhas.join('')}</div>`;
	}

	async function buscarListaOcorrencias(cdVeiculo, cdProprietario) {
		const url = `${URL_ALERTAS}?tabela=0&cd_veiculo=${encodeURIComponent(cdVeiculo)}&cd_proprietario=${encodeURIComponent(cdProprietario)}`;
		const res = await fetch(url, {
			headers: {
				"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
				"upgrade-insecure-requests": "1"
			},
			method: "GET",
			mode: "cors",
			credentials: "include"
		});
		const buf = await res.arrayBuffer();
		const txt = new TextDecoder('windows-1252').decode(buf);
		return parseListaOcorrencias(txt);
	}

	function abrirTratarOcorrencias(dados) {
		D.getElementById('modal-tratar-ocorrencias')?.remove();

		const placa = dados.placa || 'N/D';
		const modal = D.createElement('div');
		modal.id = 'modal-tratar-ocorrencias';
		modal.style.cssText =
			'position:fixed;top:3%;left:50%;transform:translateX(-50%);width:760px;max-width:96vw;' +
			'max-height:94vh;overflow:hidden;background:#fff;z-index:2147483000;' +
			'display:flex;flex-direction:column;' +
			'';
		modal.classList.add('cop-jan');
		estiloJanelas();

		modal.innerHTML = `
			<div id="tr-header" class="cop-jan-head" style="--cop-acento:#00695C;cursor:move;display:flex;align-items:center;gap:8px;user-select:none;">
				<span style="flex:1;">\u{1F6E0}\uFE0F Tratar Ocorr\u00EAncias \u2014 ${escHtml(placa)}</span>
				<button id="tr-refresh" style="background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.5);color:#fff;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;">\u21BB Atualizar</button>
				<button id="tr-fechar" class="cop-jan-x">\u2716</button>
			</div>
			<div id="tr-corpo" style="flex:1 1 auto;min-height:0;padding:12px 14px;overflow-y:auto;overflow-x:hidden;font-size:13px;color:#222;">Carregando...</div>`;

		D.body.appendChild(modal);

		D.getElementById('tr-fechar').onclick = () => modal.remove();
		D.getElementById('tr-refresh').onclick = () => carregarLista();

		// arraste pelo cabecalho
		const header = D.getElementById('tr-header');
		header.onmousedown = (e) => {
			if (e.target.closest('button')) return;
			const sx = e.clientX - modal.getBoundingClientRect().left;
			const sy = e.clientY - modal.getBoundingClientRect().top;
			const mv = ev => { modal.style.left = (ev.pageX - sx) + 'px'; modal.style.top = (ev.pageY - sy) + 'px'; modal.style.transform = 'none'; };
			const up = () => { D.removeEventListener('mousemove', mv); D.removeEventListener('mouseup', up); };
			D.addEventListener('mousemove', mv); D.addEventListener('mouseup', up);
			e.preventDefault();
		};

		const corpo = () => D.getElementById('tr-corpo');

		// ---------- TELA 1: LISTA DE OCORRENCIAS ----------
		async function carregarLista() {
			ajustarTamanhoJanela(false);
			const c = corpo(); if (!c) return;
			c.innerHTML = '\u23F3 Buscando ocorr\u00EAncias...';
			try {
				const lista = await buscarListaOcorrencias(dados.cd_veiculo, dados.cd_proprietario);
				T.__acListaAtual = lista; // guarda p/ dt_reag e cd_clifor
				// nada mais a fazer nesta placa? (lista vazia, ou tudo reagendado/autom\u00E1tico)
				const pendentes = lista.ocorrencias.filter(o =>
					!ehPernoiteIgnorada(o.alerta) && (o.reagendar || o.acao));
				if (!pendentes.length) {
					const reagendadas = lista.ocorrencias.filter(o => /reagendad/i.test(o.status || ''));
					const resumo = !lista.ocorrencias.length
						? '\u2714 Nenhuma ocorr\u00EAncia em aberto para esta placa.'
						: (reagendadas.length
							? `\u2714 Tratamento conclu\u00EDdo \u2014 ${reagendadas.length} ocorr\u00EAncia(s) reagendada(s).`
							: '\u2714 Nenhuma ocorr\u00EAncia pendente para esta placa.');
					// pr\u00F3xima placa com ocorr\u00EAncia no grid, para emendar o tratamento
					let proxima = null;
					try {
						const visiveis = veiculosVisiveisNoGrid();
						proxima = visiveis.find(v => v.placa !== dados.placa &&
							(v.ocorrencias || '').replace(/\s/g, '') && !/^0$/.test((v.ocorrencias || '').trim()));
					} catch (e) { }

					c.innerHTML = `<div style="padding:14px;color:#2e7d32;font-size:14px;">${resumo}` +
						(reagendadas.length
							? '<div style="font-size:12px;color:#555;margin-top:6px;">' +
							  reagendadas.map(o => `${escHtml(o.alerta || 'Ocorr\u00EAncia')}: ${escHtml(o.status)}`).join('<br>') + '</div>'
							: '') +
						(proxima
							? `<div style="margin-top:12px;padding:8px 10px;background:#e8f4fd;border:1px solid #b6d9f2;border-radius:6px;">` +
							  `<span style="font-size:12px;color:#1565C0;">Pr\u00F3xima placa com ocorr\u00EAncia: <b>${escHtml(proxima.placa)}</b>` +
							  `<span style="color:#777;"> \u00B7 ${escHtml((proxima.ocorrencias || '').slice(0, 40))}</span></span>` +
							  `<button id="tr-proxima" style="background:#1565C0;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-weight:bold;font-size:12px;cursor:pointer;margin-left:10px;">\u25B6 Tratar esta</button></div>`
							: '') +
						'<div style="font-size:12px;color:#777;margin-top:8px;">Fechando e atualizando o grid...</div></div>';

					if (proxima) {
						const bp = D.getElementById('tr-proxima');
						if (bp) bp.onclick = () => {
							if (T.__acFechaTratar) { clearTimeout(T.__acFechaTratar); T.__acFechaTratar = null; }
							D.getElementById('modal-tratar-ocorrencias')?.remove();
							abrirTratarOcorrencias({
								placa: proxima.placa, cd_veiculo: proxima.cdVeiculo,
								cd_proprietario: proxima.cdProp, cd_clifor: proxima.cdProp,
								cliente: proxima.cliente, posicao: proxima.posicao || ''
							});
						};
					}
					T.__acFechaTratar = setTimeout(() => {
						D.getElementById('modal-tratar-ocorrencias')?.remove();
						if (T.__acEsperaAcion) { clearInterval(T.__acEsperaAcion); T.__acEsperaAcion = null; }
						recarregarGrid();
					}, proxima ? 6000 : 1600);   // com pr\u00F3xima placa, d\u00E1 tempo de clicar
					return;
				}
				// plano de passos de cada ocorrencia (detalhes.php), em paralelo;
				// sem cache: o plano atualiza conforme os passos avancam
				const planos = await Promise.all(lista.ocorrencias.map(o =>
					(!ehPernoiteIgnorada(o.alerta) && o.cdAtua && o.cdProcesso)
						? buscarPlanoPassos(o.cdAtua, o.cdProcesso, lista.cdClifor).catch(() => null)
						: Promise.resolve(null)
				));
				// o plano fica junto da ocorrencia (usado na tela do passo)
				lista.ocorrencias.forEach((o, i) => { o.plano = planos[i] || []; });
				let html = '';
				lista.ocorrencias.forEach((o, i) => {
					const idx = i;
					let acaoBtn;
					if (ehPernoiteIgnorada(o.alerta)) {
						// processo automatico do sistema: usuario nao atua
						acaoBtn = '<span style="color:#999;font-size:12px;">\u{1F512} Processo autom\u00E1tico do sistema \u2014 n\u00E3o atuar</span>';
					} else if (o.reagendar) {
						acaoBtn = `<button data-reagendar="${idx}" style="background:#6A1B9A;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-weight:bold;cursor:pointer;">\u21BB Reagendar</button>`;
					} else if (o.acao) {
						acaoBtn = `<button data-tratar="${idx}" style="background:#00695C;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-weight:bold;cursor:pointer;">\u25B6 Tratar passo</button>` +
							(decisaoDoPasso(o.passoLabel, o.cdAtua)
								? ` <button data-repetir="${idx}" title="Repetir a resposta j\u00E1 dada neste mesmo passo, sem refazer a anota\u00E7\u00E3o" style="background:#1565C0;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-weight:bold;cursor:pointer;">\u23E9 Repetir tratativa</button>`
								: '') +
							` <button data-baixar="${idx}" title="Marca todos os passos como N\u00C3O, sem anota\u00E7\u00E3o na placa.&#10;Para alerta falso, pedido da frota para desconsiderar, anota\u00E7\u00F5es j\u00E1 feitas manualmente ou libera\u00E7\u00E3o de sensor defeituoso inclu\u00EDda." style="background:transparent;color:#8a6d3b;border:1px solid #d9c49a;border-radius:6px;padding:8px 12px;cursor:pointer;">\u23ED Baixar sem tratativa</button>`;
					} else {
						acaoBtn = '<span style="color:#999;">\u2014</span>';
					}
					html +=
						'<div style="border:1px solid #ddd;border-radius:8px;padding:10px 12px;margin-bottom:10px;background:#fafafa;">' +
						`<div style="font-weight:bold;font-size:14px;color:#00544a;">${escHtml(o.alerta || 'Ocorr\u00EAncia')}</div>` +
						`<div style="font-size:12px;color:#555;margin:3px 0;">Status: ${escHtml(o.status || '\u2014')} &nbsp;|&nbsp; Em atraso: ${escHtml(o.geracao || '\u2014')}</div>` +
						(o.passoLabel ? `<div style="font-size:12px;color:#333;margin-bottom:2px;">Passo atual: <b>${escHtml(o.passoLabel)}</b></div>` : '<div style="margin-bottom:8px;"></div>') +
						((planos[idx] && planos[idx].length) ? htmlPlanoPassos(planos[idx]) : '<div style="margin-bottom:6px;"></div>') +
						acaoBtn +
						'</div>';
				});
				c.innerHTML = html;

				c.querySelectorAll('[data-tratar]').forEach(b => {
					b.onclick = () => abrirPasso(lista.ocorrencias[parseInt(b.dataset.tratar, 10)]);
				});
				c.querySelectorAll('[data-reagendar]').forEach(b => {
					b.onclick = () => telaReagendar(lista.ocorrencias[parseInt(b.dataset.reagendar, 10)], lista.dtReag);
				});
				c.querySelectorAll('[data-baixar]').forEach(b => {
					b.onclick = () => baixarSemTratativa(lista.ocorrencias[parseInt(b.dataset.baixar, 10)]);
				});
				c.querySelectorAll('[data-repetir]').forEach(b => {
					b.onclick = () => repetirTratativa(lista.ocorrencias[parseInt(b.dataset.repetir, 10)]);
				});
			} catch (e) {
				console.error('[TRATAR] erro ao buscar lista:', e);
				c.innerHTML = '<div style="padding:10px;color:#b22222;">Erro ao buscar as ocorr\u00EAncias. Veja o console (F12).</div>';
			}
		}

		// ---------- TELA 2: PASSO (SIM / NAO) ----------
		// identifica o tipo de passo pelo rotulo
		function tipoPasso(label) {
			const s = String(label || '').toUpperCase();
			if (/FORMALIZAR|ENVIAR\s+NO\s+GRUPO/.test(s)) return 'formalizar';
			if (/ACIONAMENTO\s+POLICIAL|ACIONAR.*POLIC|POLICIAL/.test(s)) return 'acionamento';
			if (/VISUALIZA[C\u00C7][A\u00C3]O.*MAPA|MAPA.*VISUAL|LOCALIZA[C\u00C7][A\u00C3]O.*MAPA/.test(s)) return 'mapa';
			if (/WHATS\s*APP|WHATSAPP|\bWPP\b/.test(s)) return 'whatsapp';
			if (/CONTATO/.test(s) && /(TRANSPORTADOR|FROTA|GESTOR|EMPRESA)/.test(s)) return 'contato-frota';
			if (/CONTATO/.test(s) && /(MOTORISTA|CONDUTOR)/.test(s)) return 'contato';
			return 'generico';
		}

		// o plano desta ocorrencia tem um passo proprio de WhatsApp?
		// (nesse caso o passo de contato comum fica so com a ligacao)
		function planoTemPassoWhatsapp(occ) {
			const passos = (occ && occ.plano) || [];
			return passos.some(p => tipoPasso(String(p.titulo || '').replace(/^PASSO\s+\d+\s*-\s*/i, '')) === 'whatsapp');
		}

		// regra de pernoite considerando a velocidade atual da placa
		function regraPernoiteAtual() {
			let vel = velocidadeDaLinha(acharLinhaSelecionada());
			if (vel === null) { const v = parseInt((dados.velocidade || '').replace(/\D/g, ''), 10); vel = isNaN(v) ? null : v; }
			return pernoiteBloqueio(dados.cliente, vel);
		}

		// dispara a msg 2 do "Escolha a mensagem" (reutiliza o interceptor de pernoite/anotacao)
		function enviarWhatsappMsg2(cdVeiculo) {
			let chatEl = null;
			(function walk(w) {
				try {
					const loc = w.document.getElementById('ds_posicao_' + cdVeiculo);
					if (loc) { const tr = loc.closest('tr'); if (tr) { const el = tr.querySelector('[onclick*="abrirModalMensagem"]'); if (el) chatEl = el; } }
					for (let i = 0; i < w.frames.length; i++) walk(w.frames[i]);
				} catch (e) {}
			})(T);
			if (!chatEl) { alert('N\u00E3o encontrei o contato de WhatsApp desta placa no grid.'); return; }
			chatEl.click();
			let tries = 0;
			const iv = setInterval(() => {
				tries++;
				let btn = null;
				(function walk(w) { try { const b = w.document.getElementById('msg2'); if (b) btn = b; for (let i = 0; i < w.frames.length; i++) walk(w.frames[i]); } catch (e) {} })(T);
				if (btn) { clearInterval(iv); btn.click(); }
				else if (tries >= 25) { clearInterval(iv); }
			}, 120);
		}

		async function abrirPasso(occ) {
			const c = corpo(); if (!c) return;
			if (ehPernoiteIgnorada(occ.alerta)) {
				alert('"' + occ.alerta + '" \u00E9 um processo autom\u00E1tico do sistema \u2014 n\u00E3o deve ser tratado manualmente.');
				carregarLista();
				return;
			}
			c.innerHTML = '\u23F3 Carregando passo...';
			try {
				const cdClifor = (T.__acListaAtual && T.__acListaAtual.cdClifor) || dados.cd_proprietario;
				const passo = await buscarPassoTratamento(occ.acao, occ.cdAtua, cdClifor, dados.cd_veiculo, occ.cdMotorista);
				const tipo = tipoPasso(occ.passoLabel);

				// no passo "Formalizar", a obs (SIM) e a mesma do "Informado via grupo".
				// Velocidade n\u00E3o precisa ser informada ao cliente: fica de fora da lista.
				if (tipo === 'formalizar') {
					try {
						const alertas = await buscarAlertas(dados.cd_veiculo, dados.cd_proprietario);
						const nomes = [];
						alertas.forEach(a => {
							if (!a.alerta || ehOcorrenciaOculta(a.alerta)) return;
							if (ehOcorrenciaSemInformativo(a.alerta)) return;
							if (nomes.indexOf(a.alerta) === -1) nomes.push(a.alerta);
						});
						if (nomes.length) passo.ds_obs = nomes.join(', ') + SUFIXO_INFORMADO;
					} catch (e) {}
				}

				renderPasso(occ, passo, tipo);
			} catch (e) {
				console.error('[TRATAR] erro ao abrir passo:', e);
				c.innerHTML = '<div style="padding:10px;color:#b22222;">Erro ao abrir o passo. Veja o console (F12).</div>';
			}
		}

		/* O passo do mapa usa a janela ampliada; qualquer outra tela volta ao
		   tamanho normal. Guarda o original para restaurar sem perder ajustes. */
		function ajustarTamanhoJanela(ampliar) {
			const m = D.getElementById('modal-tratar-ocorrencias');
			if (!m) return;
			if (!m.__acTamanhoNormal) {
				m.__acTamanhoNormal = { width: m.style.width, maxHeight: m.style.maxHeight, top: m.style.top };
			}
			if (ampliar) {
				m.style.width = '900px';
				m.style.maxHeight = '97vh';
				m.style.height = '97vh';                                  // usa a altura toda
				if (m.style.transform !== 'none') m.style.top = '1.5%';   // s\u00F3 se n\u00E3o foi arrastada
			} else {
				const n = m.__acTamanhoNormal;
				m.style.width = n.width || '760px';
				m.style.maxHeight = n.maxHeight || '94vh';
				m.style.height = '';
				if (m.style.transform !== 'none') m.style.top = n.top || '3%';
			}
		}

		/* Atalhos: S = SIM, N = N\u00C3O, Esc = voltar. A a\u00E7\u00E3o mais repetida do turno
		   deixa de exigir mouse. Ignorados enquanto se digita.                */
		function ligarAtalhosPasso() {
			if (T.__acAtalhoPasso) D.removeEventListener('keydown', T.__acAtalhoPasso, true);
			T.__acAtalhoPasso = ev => {
				if (!D.getElementById('modal-tratar-ocorrencias')) return;
				const alvo = ev.target;
				const digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable);
				if (ev.key === 'Escape' && !digitando) {
					const v = D.getElementById('tr-voltar') || D.getElementById('tr-voltar2');
					if (v) { ev.preventDefault(); v.click(); }
					return;
				}
				if (digitando || ev.ctrlKey || ev.altKey || ev.metaKey) return;
				const k = String(ev.key || '').toUpperCase();
				const btn = k === 'S' ? D.getElementById('tr-sim') : (k === 'N' ? D.getElementById('tr-nao') : null);
				if (btn && !btn.disabled) { ev.preventDefault(); btn.click(); }
			};
			D.addEventListener('keydown', T.__acAtalhoPasso, true);
		}

		function renderPasso(occ, passo, tipo) {
			ajustarTamanhoJanela(tipo === 'mapa');
			ligarAtalhosPasso();
			// contato j\u00E1 registrado nesta placa: as demais ocorr\u00EAncias n\u00E3o repetem a anota\u00E7\u00E3o
			const jaAnotouContato = () => {
				try { const ss = sessTrat(dados.cd_veiculo); return !!(ss.contato || (ss.contatoFrota || []).length); }
				catch (e) { return false; }
			};

			const c = corpo(); if (!c) return;
			// no passo do mapa, a posi\u00E7\u00E3o vai para o t\u00EDtulo da janela
			try {
				const tit = D.querySelector('#modal-tratar-ocorrencias .cop-jan-head span, #tr-header span');
				if (tit) tit.textContent = (tipo === 'mapa' && dados.posicao)
					? `\u{1F5FA} ${dados.placa} \u2014 ${dados.posicao}`
					: `\u{1F6E0} Tratar Ocorr\u00EAncias \u2014 ${dados.placa}`;
			} catch (e) { }
			tipo = tipo || 'generico';

			/* Telefone do condutor a partir do passo. O cadastro varia bastante:
			   "FONE 1 = 42147037826", "FONE 1 = (42) 14703-7826", "CELULAR = ...".
			   Pegamos o valor de cada r\u00F3tulo e limpamos a pontua\u00E7\u00E3o depois.      */
			const fones = [];
			String(passo.contato || '')
				.replace(/(?:FONE|TELEFONE|CELULAR|CEL|TEL)\s*\d*\s*[:=]\s*([\d()\s.\-]{8,})/gi,
					(t, n) => { fones.push(String(n).replace(/\D/g, '')); return t; });
			// s\u00F3 campos com r\u00F3tulo de telefone: varrer o texto solto pegaria CPF de outro campo
			const telMot = escolherTelefoneMotorista(fones.filter(Boolean));

			// progresso pelo plano de passos j\u00E1 carregado
			const progresso = (() => {
				const plano = (occ.plano && occ.plano.length) ? occ.plano : null;
				if (!plano) return '';
				const rot = x => (x && (x.label || x.nome)) || x;
				const atual = plano.findIndex(x => chavePasso(rot(x)) === chavePasso(occ.passoLabel));
				if (atual < 0) return '';
				const bolas = plano.map((x, i) => i < atual ? '\u25CF' : (i === atual ? '\u25C9' : '\u25CB')).join('');
				return `<span style="color:#00695C;font-size:12px;letter-spacing:2px;" title="${escAttr(plano.map(rot).join(' \u2192 '))}">${bolas}</span>` +
					`<span style="color:#777;font-size:11px;margin-left:6px;">passo ${atual + 1} de ${plano.length}</span>`;
			})();

			// no passo do mapa o cabe\u00E7alho vira uma linha s\u00F3, liberando altura para o mapa
			const cabecalho = (tipo === 'mapa')
				? `<div style="font-size:12px;color:#00544a;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 0 auto;">` +
				  `<b>${escHtml(occ.alerta || 'Ocorr\u00EAncia')}</b> \u00B7 ${escHtml(occ.passoLabel || occ.acao)}` +
				  `<span style="color:#777;"> \u00B7 em atraso: ${escHtml(occ.geracao || '\u2014')}</span></div>`
				: `<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:4px;">` +
				  `<b style="font-size:14px;color:#00544a;">${escHtml(occ.alerta || 'Ocorr\u00EAncia')}</b>` +
				  `<span style="font-size:11px;color:#777;">em atraso: ${escHtml(occ.geracao || '\u2014')}</span>` +
				  (progresso ? `<span style="margin-left:auto;">${progresso}</span>` : '') + '</div>' +
				  `<div style="background:#e0f2f1;border:1px solid #b2dfdb;border-radius:6px;padding:6px 10px;font-size:13px;color:#00695C;margin-bottom:8px;">` +
				  `<b>${escHtml(occ.passoLabel || occ.acao)}</b>` +
				  (passo.nome ? `<span style="color:#444;font-size:12px;"> \u00B7 ${escHtml(passo.nome)}${passo.contato ? ' \u00B7 ' + escHtml(passo.contato) : ''}</span>` : '') +
				  '</div>';

			const voltar = '<div style="text-align:center;margin-top:12px;"><button id="tr-voltar" style="background:transparent;border:none;color:#00695C;text-decoration:underline;cursor:pointer;font-size:12px;">\u2039 Voltar \u00E0 lista</button></div>';
			const obsBox = (rotulo, valor, placeholder) =>
				`<div style="font-size:12px;color:#333;margin:4px 0;">${rotulo}</div>` +
				`<textarea id="tr-obs" rows="4" placeholder="${escAttr(placeholder || '')}" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;resize:vertical;">${escHtml(valor || '')}</textarea>` +
				'<div style="margin-top:6px;font-size:11px;color:#888;">M\u00EDn. 10 caracteres. Aspas s\u00E3o removidas automaticamente.</div>';
			const btnSim = (txt) => `<button id="tr-sim" style="background:#2e7d32;color:#fff;border:none;border-radius:8px;padding:12px 22px;font-weight:bold;font-size:14px;cursor:pointer;">${txt}</button>`;
			const btnNao = (txt) => `<button id="tr-nao" style="background:#c62828;color:#fff;border:none;border-radius:8px;padding:12px 22px;font-weight:bold;font-size:14px;cursor:pointer;">${txt}</button>`;

			let corpoHtml = '';
			const cfgFrota = (tipo === 'contato-frota') ? frotaContatosDoCliente(dados.cliente) : null;
			if (tipo === 'contato-frota' && cfgFrota) {
				let linhasFr = '';
				cfgFrota.contatos.forEach((ct, i) => {
					linhasFr +=
						'<div style="border:1px solid #e0e0e0;border-radius:8px;padding:8px 10px;margin-bottom:8px;background:#fafafa;">' +
						'<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px;">' +
						`<button type="button" class="tf-ligar" data-i="${i}" style="background:#4CAF50;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:bold;cursor:pointer;">\u{1F4DE} ${escHtml(ct.nome)} (${escHtml(formatarExibicaoNumero(ct.tel))})</button>` +
						`<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;"><input type="checkbox" class="tf-sem" data-i="${i}"> Sem contato</label>` +
						`<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;color:#777;"><input type="checkbox" class="tf-np" data-i="${i}"> N\u00E3o precisou</label>` +
						'</div>' +
						`<textarea class="tf-obs" data-i="${i}" rows="2" placeholder="Anota\u00E7\u00E3o do contato com ${escAttr(ct.nome)} (se conseguiu)" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;resize:vertical;background:#fff;"></textarea>` +
						'</div>';
				});
				corpoHtml =
					`<div style="font-size:12px;color:#333;margin-bottom:8px;">Contatos da frota <b>${escHtml(cfgFrota.nome)}</b> (na ordem de prioridade):</div>` +
					linhasFr +
					'<div style="margin-top:2px;font-size:11px;color:#888;">Marque "Sem contato" para registrar a tentativa sem sucesso; "N\u00E3o precisou" para dispensar o contato sem anotar nada; ou descreva o que obteve. Uma anota\u00E7\u00E3o \u00E9 registrada por contato preenchido/marcado.</div>' +
					'<div style="text-align:center;margin:14px 0 4px;font-weight:bold;">Obteve sucesso no passo?</div>' +
					'<div style="display:flex;gap:10px;justify-content:center;">' + btnSim('\u2714 SIM') + btnNao('\u2716 N\u00C3O') + '</div>';
			} else if (tipo === 'contato-frota') {
				// frota sem contatos cadastrados no script: passo generico com aviso
				corpoHtml =
					'<div style="background:#fff8e1;border:1px solid #e0c36b;border-radius:6px;padding:8px 10px;margin-bottom:8px;color:#7a5c00;font-size:12px;">Sem contatos de frota cadastrados no script para este cliente.</div>' +
					obsBox('Observa\u00E7\u00E3o (registrada no passo):', passo.ds_obs, '') +
					'<div style="text-align:center;margin:14px 0 4px;font-weight:bold;">Obteve sucesso no passo?</div>' +
					'<div style="display:flex;gap:10px;justify-content:center;">' + btnSim('\u2714 SIM') + btnNao('\u2716 N\u00C3O') + '</div>';
			} else if (tipo === 'mapa') {
				const urlMapaPasso = `${URL_MAPA}?equip=1&risco=0&liberado=0&trajeto=1&desloc=1&posicionamento=0` +
					'&clifor_clifor=0&postos=0&postosrota=1&riscorota=1&liberadorota=1&paradas=1&macro=1' +
					`&cd_veiculo=${encodeURIComponent(dados.cd_veiculo)}` +
					`&cd_clifor=${encodeURIComponent(dados.cd_proprietario || dados.cd_clifor || '')}` +
					`&posicao=${encodeURIComponent(dados.posicao || '')}&dhxr${Date.now()}=1`;
				// sem campo de observa\u00E7\u00E3o: o operador s\u00F3 visualiza e confirma
				corpoHtml =
					`<iframe id="tr-mapa" src="${escAttr(urlMapaPasso)}" style="width:100%;max-width:100%;box-sizing:border-box;flex:1 1 auto;min-height:200px;height:100%;border:1px solid #ccc;border-radius:8px;background:#eef2f4;display:block;"></iframe>` +
					'<div style="display:flex;gap:10px;justify-content:center;align-items:center;margin-top:8px;flex-wrap:wrap;flex:0 0 auto;">' +
					btnSim('\u2714 SIM') + btnNao('\u2716 N\u00C3O') +
					'<button id="tr-print" title="Copiar um print do mapa para a \u00E1rea de transfer\u00EAncia" style="background:#1565C0;color:#fff;border:none;border-radius:8px;padding:10px 16px;font-weight:bold;font-size:13px;cursor:pointer;">\u{1F4F7} Copiar print</button>' +
					'<button id="tr-voltar" style="background:transparent;border:none;color:#00695C;text-decoration:underline;cursor:pointer;font-size:12px;">\u2039 Voltar</button>' +
					'<button id="tr-mapa-recarregar" title="Recarregar o mapa" style="background:transparent;border:1px solid #ccc;border-radius:6px;padding:6px 10px;font-size:11px;cursor:pointer;color:#555;">\u21BB</button>' +
					`<a href="${escAttr(urlMapaPasso)}" target="_blank" style="font-size:11px;color:#1565C0;">nova aba</a>` +
					'</div>';
			} else if (tipo === 'whatsapp') {
				corpoHtml =
					'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' +
					`<button id="tr-wpp"${telMot ? '' : ' disabled'} title="${telMot ? escAttr('Enviar a mensagem 2 para ' + formatarExibicaoNumero(telMot)) : 'Sem n\u00FAmero do condutor cadastrado.'}" style="background:${telMot ? '#25D366' : '#9e9e9e'};color:#fff;border:none;border-radius:8px;padding:10px 18px;font-weight:bold;cursor:${telMot ? 'pointer' : 'not-allowed'};${telMot ? '' : 'opacity:.6;'}">\u{1F4AC} Enviar WhatsApp (msg 2)${telMot ? ' \u2014 ' + escHtml(formatarExibicaoNumero(telMot)) : ''}</button>` +
					'</div>' +
					obsBox('Anota\u00E7\u00E3o (opcional): se preenchida, ser\u00E1 usada no registro \u2014 com ou sem sucesso.', '', 'Ex.: Mensagem enviada, condutor visualizou e respondeu... / Enviado, sem retorno at\u00E9 o momento...') +
					'<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#333;margin-top:8px;cursor:pointer;">' +
					`<input type="checkbox" id="tr-anotar"${jaAnotouContato() ? '' : ' checked'}> Registrar anota\u00E7\u00E3o no ve\u00EDculo` +
					(jaAnotouContato() ? '<span style="color:#b26a00;font-size:11px;"> \u2014 j\u00E1 anotado nesta placa</span>' : '') +
					'</label>' +
					'<div style="margin-top:6px;font-size:11px;color:#888;">O envio da mensagem j\u00E1 gera sozinho a anota\u00E7\u00E3o \u201CCondutor ... acionado via WhatsApp.\u201D \u2014 aqui s\u00F3 entra o que voc\u00EA escrever.</div>' +
					'<div style="display:flex;gap:10px;justify-content:center;margin:14px 0 4px;flex-wrap:wrap;">' +
					btnSim('\u2714 Consegui') + btnNao('\u2716 Sem retorno') + '</div>';
			} else if (tipo === 'contato') {
				// se o plano tem um passo proprio de WhatsApp, aqui fica so a ligacao
				const semWppAqui = planoTemPassoWhatsapp(occ);
				corpoHtml =
					'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' +
					`<button id="tr-ligar"${telMot ? '' : ' disabled'} title="${telMot ? escAttr('Ligar para ' + formatarExibicaoNumero(telMot) + ' (bot\u00E3o direito copia o n\u00FAmero)') : 'Nenhum telefone do condutor neste passo.'}" style="background:${telMot ? '#4CAF50' : '#9e9e9e'};color:#fff;border:none;border-radius:8px;padding:10px 18px;font-weight:bold;cursor:${telMot ? 'pointer' : 'not-allowed'};${telMot ? '' : 'opacity:.6;'}">${telMot ? '\u{1F4DE} Ligar (' + escHtml(formatarExibicaoNumero(telMot)) + ')' : '\u260E Condutor sem n\u00FAmero'}</button>` +
					(semWppAqui ? '' :
					`<button id="tr-wpp"${telMot ? '' : ' disabled'} title="${telMot ? escAttr('Enviar a mensagem 2 para ' + formatarExibicaoNumero(telMot)) : 'Sem n\u00FAmero do condutor \u2014 o WhatsApp usa o mesmo n\u00FAmero da liga\u00E7\u00E3o.'}" style="background:${telMot ? '#25D366' : '#9e9e9e'};color:#fff;border:none;border-radius:8px;padding:10px 18px;font-weight:bold;cursor:${telMot ? 'pointer' : 'not-allowed'};${telMot ? '' : 'opacity:.6;'}">\u{1F4AC} WhatsApp (msg 2)</button>`) +
					'</div>' +
					(semWppAqui ? '<div style="font-size:11px;color:#888;margin:-4px 0 8px;">O envio de WhatsApp tem passo pr\u00F3prio no plano desta ocorr\u00EAncia.</div>' : '') +
					obsBox('Anota\u00E7\u00E3o (opcional): se preenchida, ser\u00E1 usada no registro \u2014 com ou sem sucesso.', '', 'Ex.: Falei com o condutor e confirmou a senha... / Fixo caiu na caixa postal, WhatsApp sem retorno...') +
					'<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#333;margin-top:8px;cursor:pointer;">' +
					`<input type="checkbox" id="tr-anotar"${jaAnotouContato() ? '' : ' checked'}> Registrar anota\u00E7\u00E3o no ve\u00EDculo` +
					(jaAnotouContato() ? '<span style="color:#b26a00;font-size:11px;"> \u2014 j\u00E1 anotado nesta placa</span>' : '') +
					'</label>' +
					'<div style="display:flex;gap:10px;justify-content:center;margin:14px 0 4px;flex-wrap:wrap;">' +
					btnSim('\u2714 Consegui contato') +
					'<button id="tr-semsucesso" style="background:#c62828;color:#fff;border:none;border-radius:8px;padding:12px 22px;font-weight:bold;font-size:14px;cursor:pointer;">\u2716 Tentativa sem sucesso</button>' +
					'</div>';
			} else if (tipo === 'acionamento') {
				corpoHtml =
					'<div style="margin-bottom:10px;">' +
					'<button id="tr-fazer-acion" style="background:#b22222;color:#fff;border:none;border-radius:8px;padding:10px 18px;font-weight:bold;cursor:pointer;">\u{1F6A8} Fazer Acionamento</button>' +
					'</div>' +
					obsBox('Observa\u00E7\u00E3o (registrada no passo):', passo.ds_obs, '') +
					'<div style="text-align:center;margin:14px 0 4px;font-weight:bold;">Obteve sucesso no passo?</div>' +
					'<div style="display:flex;gap:10px;justify-content:center;">' + btnSim('\u2714 SIM') + btnNao('\u2716 N\u00C3O') + '</div>';
			} else if (tipo === 'formalizar') {
				corpoHtml =
					'<div style="margin-bottom:10px;">' +
					'<button id="tr-informativo" style="background:#8E24AA;color:#fff;border:none;border-radius:8px;padding:10px 18px;font-weight:bold;cursor:pointer;">\u{1F4CB} Criar Informativo</button>' +
					'</div>' +
					obsBox('Anota\u00E7\u00E3o (informado via grupo do cliente):', passo.ds_obs, '') +
					'<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#333;margin-top:8px;cursor:pointer;">' +
					'<input type="checkbox" id="tr-anotar" checked> Registrar anota\u00E7\u00E3o no ve\u00EDculo ao dar o passo' +
					'</label>' +
					'<div style="text-align:center;margin:14px 0 4px;font-weight:bold;">Formalizou via grupo?</div>' +
					'<div style="display:flex;gap:10px;justify-content:center;">' + btnSim('\u2714 SIM') + btnNao('\u2716 N\u00C3O') + '</div>';
			} else {
				corpoHtml =
					obsBox('Observa\u00E7\u00E3o (registrada no passo):', passo.ds_obs, '') +
					'<div style="text-align:center;margin:14px 0 4px;font-weight:bold;">Obteve sucesso no passo?</div>' +
					'<div style="display:flex;gap:10px;justify-content:center;">' + btnSim('\u2714 SIM') + btnNao('\u2716 N\u00C3O') + '</div>';
			}

			c.innerHTML = cabecalho + corpoHtml + (tipo === 'mapa' ? '' : voltar);
			// passo do mapa: corpo em coluna flex\u00EDvel para o mapa ocupar toda a sobra
			if (tipo === 'mapa') {
				c.style.display = 'flex';
				c.style.flexDirection = 'column';
				c.style.minHeight = '0';
				c.style.overflowY = 'hidden';
			} else {
				c.style.display = '';
				c.style.flexDirection = '';
				c.style.minHeight = '0';
				c.style.overflowY = 'auto';
			}

			const el = id => D.getElementById(id);
			const obsCampo = () => (el('tr-obs')?.value || '').replace(/['"]/g, '').trim();
			const anotarMarcado = () => !!(el('tr-anotar') && el('tr-anotar').checked);

			// rastreia quais meios de contato o operador usou neste passo
			let usouLigar = false, usouWpp = false;

			el('tr-voltar').onclick = () => carregarLista();
			setTimeout(() => {
				const obs = el('tr-obs');
				if (obs && tipo !== 'mapa') { try { obs.focus(); obs.setSelectionRange(obs.value.length, obs.value.length); } catch (e) { } }
				const bs = el('tr-sim'), bn = el('tr-nao');
				if (bs && bs.textContent.indexOf('(S)') === -1) bs.textContent += ' (S)';
				if (bn && bn.textContent.indexOf('(N)') === -1) bn.textContent += ' (N)';
			}, 0);

			// Ligar (com pernoite)
			if (el('tr-ligar')) {
				el('tr-ligar').oncontextmenu = (ev) => copiarNumeroSobDemanda(ev, telMot);
				el('tr-ligar').onclick = () => {
				const sip = formatarSip(telMot);
				if (!sip) { alert('O condutor n\u00E3o tem n\u00FAmero cadastrado.'); return; }
				const regra = regraPernoiteAtual();
				if (regra) {
					if (regra.permiteLigar) { if (!confirm(textoPernoite(regra) + '\n\nDeseja realmente ligar?')) return; }
					else { alert(textoPernoite(regra) + '\n\nLiga\u00E7\u00E3o n\u00E3o permitida neste hor\u00E1rio.'); return; }
				}
				usouLigar = true;
				const a = D.createElement('a'); a.href = sip; a.click();
				};
			}

			// WhatsApp msg 2 (pernoite/anotacao via interceptor nativo)
			if (el('tr-wpp')) el('tr-wpp').onclick = () => {
				if (!telMot) { alert('O condutor n\u00E3o tem n\u00FAmero cadastrado.'); return; }
				const regra = regraPernoiteAtual();
				if (regra && !regra.permiteLigar) {
					alert(textoPernoite(regra) + '\n\nEnvio de mensagem n\u00E3o permitido neste hor\u00E1rio.');
					return;
				}
				usouWpp = true;
				enviarWhatsappMsg2(dados.cd_veiculo);
			};

			// Fazer Acionamento (abre o modal existente)
			if (el('tr-fazer-acion')) el('tr-fazer-acion').onclick = () => {
				const sess = sessTrat(dados.cd_veiculo);
				sess.resultadoAcion = null;                // limpa o resultado anterior
				buscarCoordenadas(dados, el('tr-fazer-acion'));

				// ao registrar o acionamento, o passo \u00E9 dado sozinho conforme o resultado
				if (T.__acEsperaAcion) clearInterval(T.__acEsperaAcion);
				T.__acEsperaAcion = setInterval(() => {
					let sessAtual;
					try { sessAtual = sessTrat(dados.cd_veiculo); } catch (e) { return; }
					if (!sessAtual.resultadoAcion) return;
					const res = sessAtual.resultadoAcion;
					clearInterval(T.__acEsperaAcion); T.__acEsperaAcion = null;
					sessAtual.resultadoAcion = null;
					if (!D.getElementById('modal-tratar-ocorrencias')) return;   // painel fechado

					const fallback = (passo.ds_obs || '').replace(/['"]/g, '').trim();
					if (res === 'sucesso') {
						let obs = (sessAtual.acionSucessos || []).join(' | ').replace(/['"]/g, '').trim();
						if (obs.length < 10) obs = fallback.length >= 10 ? fallback : 'Acionamento policial realizado com sucesso.';
						console.log('[TRATAR] acionamento com contato \u2014 dando o passo como SIM');
						executarPasso(occ, passo, '1', obs, '');
					} else {
						const padrao = (res === 'sem-postos')
							? 'Nenhum posto policial pr\u00F3ximo \u00E0 posi\u00E7\u00E3o.'
							: 'Tentativas de contato com postos policiais sem sucesso.';
						const obs = fallback.length >= 10 ? fallback : padrao;
						console.log('[TRATAR] acionamento sem contato (' + res + ') \u2014 dando o passo como N\u00C3O');
						executarPasso(occ, passo, '2', obs, '');
					}
				}, 500);
			};

			// Criar Informativo (no passo Formalizar: com as anotacoes da placa)
			if (el('tr-informativo')) el('tr-informativo').onclick = async () => {
				const b = el('tr-informativo');
				const orig = b.textContent;
				b.disabled = true; b.textContent = '\u23F3 Gerando...';
				try {
					// a placa teve passos de contato/transportadora/policia?
					// criterio: alguma ocorrencia com passo atual desses tipos, ou passo n>1
					// (numero > 1 = houve passos anteriores no plano), ou sessao com registros.
					let permitir = true;
					try {
						const ocs = (T.__acListaAtual && T.__acListaAtual.ocorrencias) || [];
						const relevantes = ocs.filter(o => !ehOcorrenciaOculta(o.alerta));
						if (relevantes.length) {
							const sess = sessTrat(dados.cd_veiculo);
							permitir = relevantes.some(o => {
								const t = tipoPasso(o.passoLabel);
								return t === 'contato' || t === 'contato-frota' || t === 'acionamento' ||
									(o.numeroPasso != null && o.numeroPasso > 1) || o.reagendar;
							}) || !!sess.contato || !!sess.contatoFrota.length || !!sess.acionamentos.length;
						}
					} catch (e) {}

					const anotacoes = await montarAnotacoesFormalizar(dados.cd_veiculo, permitir);
					const txt = await gerarTextoInformativo(dados, anotacoes, true);
					await copiarSilencioso(txt);
					b.textContent = '\u2714 Copiado!';
					setTimeout(() => { b.textContent = orig; b.disabled = false; }, 1600);
				} catch (e) {
					console.error('[TRATAR/INFORMATIVO] erro:', e);
					alert('Erro ao criar informativo: ' + (e && e.message ? e.message : 'veja o console (F12).'));
					b.textContent = orig; b.disabled = false;
				}
			};

			if (tipo === 'contato-frota' && cfgFrota) {
				// "Sem contato" e "Nao precisou": mutuamente exclusivos;
				// qualquer um marcado desabilita a caixa de texto da linha
				const atualizarLinhaFrota = (i) => {
					const sem = c.querySelector('.tf-sem[data-i="' + i + '"]');
					const np  = c.querySelector('.tf-np[data-i="' + i + '"]');
					const ta  = c.querySelector('.tf-obs[data-i="' + i + '"]');
					const off = !!(sem && sem.checked) || !!(np && np.checked);
					if (ta) { ta.disabled = off; ta.style.background = off ? '#eee' : '#fff'; }
				};
				c.querySelectorAll('.tf-sem').forEach(cb => {
					cb.onchange = () => {
						if (cb.checked) { const np = c.querySelector('.tf-np[data-i="' + cb.dataset.i + '"]'); if (np) np.checked = false; }
						atualizarLinhaFrota(cb.dataset.i);
					};
				});
				c.querySelectorAll('.tf-np').forEach(cb => {
					cb.onchange = () => {
						if (cb.checked) { const sem = c.querySelector('.tf-sem[data-i="' + cb.dataset.i + '"]'); if (sem) sem.checked = false; }
						atualizarLinhaFrota(cb.dataset.i);
					};
				});

				// ligar para o frota (com o aviso de pernoite da transportadora)
				c.querySelectorAll('.tf-ligar').forEach(b => {
					const ctB = cfgFrota.contatos[parseInt(b.dataset.i, 10)];
					if (ctB) b.oncontextmenu = (ev) => copiarNumeroSobDemanda(ev, ctB.tel);
					b.onclick = () => {
						const ct = cfgFrota.contatos[parseInt(b.dataset.i, 10)];
						if (!ct) return;
						const sip = formatarSip(ct.tel);
						if (!sip) { alert('N\u00FAmero inv\u00E1lido.'); return; }
						const av = cfgFrota.avisoPernoite;
						if (av && emJanela(av.ini, av.fim)) {
							if (!confirm(cfgFrota.nome + ': ' + av.texto + '\n\nDeseja realmente ligar para ' + ct.nome + '?')) return;
						}
						const a = D.createElement('a'); a.href = sip; a.click();
					};
				});

				// coleta as anotacoes por contato (checkbox = sem sucesso; texto = o que obteve)
				const coletarFrota = () => {
					const anotacoes = [], sucessos = [], semSucesso = [];
					cfgFrota.contatos.forEach((ct, i) => {
						const np = c.querySelector('.tf-np[data-i="' + i + '"]')?.checked;
						if (np) return; // contato dispensado: nao anota nada
						const sem = c.querySelector('.tf-sem[data-i="' + i + '"]')?.checked;
						const txt = (c.querySelector('.tf-obs[data-i="' + i + '"]')?.value || '').replace(/['"]/g, '').trim();
						const telFmt = formatarExibicaoNumero(ct.tel);
						if (sem) {
							anotacoes.push(`Tentativa de contato com o frota ${ct.nome} ${telFmt} via fixo sem sucesso.`);
							semSucesso.push(ct.nome);
						} else if (txt) {
							anotacoes.push(`Em contato com o frota ${ct.nome} ${telFmt}: ${txt}`);
							sucessos.push(txt);
						}
					});
					return { anotacoes: anotacoes, sucessos: sucessos, semSucesso: semSucesso };
				};

				if (el('tr-sim')) el('tr-sim').onclick = () => {
					const r = coletarFrota();
					if (r.anotacoes.length) sessTrat(dados.cd_veiculo).contatoFrota = r.anotacoes.slice();
					const fallback = (passo.ds_obs || '').replace(/['"]/g, '').trim();
					let dsObs = r.sucessos.join(' | ');
					if (dsObs.length < 10) dsObs = (fallback.length >= 10 ? fallback : 'Contato realizado com a transportadora.');
					executarPasso(occ, passo, '1', dsObs, r.anotacoes);
				};
				if (el('tr-nao')) el('tr-nao').onclick = () => {
					const r = coletarFrota();
					if (r.anotacoes.length) sessTrat(dados.cd_veiculo).contatoFrota = r.anotacoes.slice();
					const dsObs = 'Tentativas de contato com a transportadora via fixo sem sucesso.';
					executarPasso(occ, passo, '2', dsObs, r.anotacoes);
				};
			} else if (tipo === 'mapa') {
				/* Ajusta o mapa ao espa\u00E7o que sobra: mede o corpo do modal e desconta
				   a altura de tudo que est\u00E1 acima/abaixo dele. Assim nunca sobra rolagem,
				   qualquer que seja o tamanho do cabe\u00E7alho ou do plano de passos.       */
				// o iframe estica pelo flex; aqui s\u00F3 garantimos que ele n\u00E3o fique min\u00FAsculo
				const ajustarMapa = () => {
					const c = corpo(), f = el('tr-mapa');
					if (!c || !f) return;
					let usado = 0;
					Array.from(c.children).forEach(ch => { if (ch !== f) usado += ch.offsetHeight + 8; });
					const est = D.defaultView.getComputedStyle(c);
					const padding = parseFloat(est.paddingTop || 0) + parseFloat(est.paddingBottom || 0);
					const disp = c.clientHeight - usado - padding - 6;
					if (disp > 200) f.style.minHeight = Math.round(disp) + 'px';   // refor\u00E7o, n\u00E3o limite
				};
				setTimeout(ajustarMapa, 0);
				setTimeout(ajustarMapa, 250);        // depois do mapa carregar
				if (T.__acAjusteMapa) T.removeEventListener('resize', T.__acAjusteMapa);
				T.__acAjusteMapa = () => { try { ajustarMapa(); } catch (e) { } };
				T.addEventListener('resize', T.__acAjusteMapa);

				if (el('tr-print')) el('tr-print').onclick = () => copiarPrintDoMapa(el('tr-mapa'), el('tr-print'));
				if (el('tr-mapa-recarregar')) el('tr-mapa-recarregar').onclick = () => {
					const f = el('tr-mapa');
					if (f) f.src = f.src.replace(/&dhxr\d+=1/, '&dhxr' + Date.now() + '=1');
				};
				// n\u00E3o h\u00E1 campo aqui: usa a observa\u00E7\u00E3o do sistema ou um texto padr\u00E3o
				const obsMapa = (padrao) => {
					const fallback = (passo.ds_obs || '').replace(/['"]/g, '').trim();
					return fallback.length >= 10 ? fallback : padrao;
				};
				if (el('tr-sim')) el('tr-sim').onclick = () =>
					executarPasso(occ, passo, '1', obsMapa('Localiza\u00E7\u00E3o do ve\u00EDculo visualizada no mapa.'), '');
				if (el('tr-nao')) el('tr-nao').onclick = () =>
					executarPasso(occ, passo, '2', obsMapa('N\u00E3o foi poss\u00EDvel visualizar a localiza\u00E7\u00E3o no mapa.'), '');
			} else if (tipo === 'whatsapp') {
				// envio da msg 2 (as regras de pernoite da frota valem igual)
				if (el('tr-wpp')) el('tr-wpp').onclick = () => {
					if (!telMot) { alert('O condutor n\u00E3o tem n\u00FAmero cadastrado.'); return; }
					const regra = regraPernoiteAtual();
					if (regra && !regra.permiteLigar) {
						alert(textoPernoite(regra) + '\n\nEnvio de mensagem n\u00E3o permitido neste hor\u00E1rio.');
						return;
					}
					usouWpp = true;
					enviarWhatsappMsg2(dados.cd_veiculo);
				};

				// SIM: a anotacao "acionado via WhatsApp" ja e gerada pelo proprio envio;
				// aqui registramos apenas o que o operador escrever.
				if (el('tr-sim')) el('tr-sim').onclick = () => {
					const txt = obsCampo();
					const fallback = (passo.ds_obs || '').replace(/['"]/g, '').trim();
					const dsObs = txt.length >= 10 ? txt
						: (fallback.length >= 10 ? fallback : 'Mensagem enviada ao condutor via WhatsApp.');
					const comentario = (anotarMarcado() && txt) ? txt : '';
					if (comentario) sessTrat(dados.cd_veiculo).contato = comentario;
					executarPasso(occ, passo, '1', dsObs, comentario);
				};

				if (el('tr-nao')) el('tr-nao').onclick = () => {
					const txtCampo = obsCampo();
					const nome = (passo.nome || dados.motorista || '').trim();
					const semNome = !nome || /^n[\u00E3a]o informado$/i.test(nome);
					let txtAuto;
					if (semNome)      txtAuto = 'Sem condutor vinculado ao ve\u00EDculo.';
					else if (!telMot) txtAuto = 'Sem contato do condutor cadastrado.';
					else              txtAuto = `Mensagem enviada via WhatsApp para o condutor ${nome} ${formatarExibicaoNumero(telMot)} sem retorno.`;
					// o envio ja registrou "Condutor ... acionado via WhatsApp." (interceptor);
					// anotacao extra no veiculo SO se o operador escrever algo ou houver pernoite
					const notaPern = notaPernoite(dados.cliente);
					const comentario = (anotarMarcado() && (txtCampo || notaPern))
						? comNotaPernoite(txtCampo, dados.cliente) : '';
					if (comentario) sessTrat(dados.cd_veiculo).contato = comentario;
					executarPasso(occ, passo, '2', comNotaPernoite(txtCampo || txtAuto, dados.cliente), comentario);
				};
			} else if (tipo === 'contato') {
				// SIM = consegui contato: campo opcional.
				// - passo (ds_obs): usa o texto se tiver >=10 chars; senao mantem o pre-preenchido do sistema.
				// - anotacao no veiculo: so se checkbox marcado E houver texto.
				if (el('tr-sim')) el('tr-sim').onclick = () => {
					const txt = obsCampo();
					const fallback = (passo.ds_obs || '').replace(/['"]/g, '').trim();
					const dsObs = txt.length >= 10 ? txt
						: (fallback.length >= 10 ? fallback : 'Contato realizado com o condutor.');
					const comentario = (anotarMarcado() && txt) ? txt : '';
					if (comentario) sessTrat(dados.cd_veiculo).contato = comentario;
					executarPasso(occ, passo, '1', dsObs, comentario);
				};

				// NAO = tentativa sem sucesso: texto conforme os meios usados.
				if (el('tr-semsucesso')) el('tr-semsucesso').onclick = () => {
					// se o operador escreveu algo no campo, a anotacao e o que ele escreveu
					const txtCampo = obsCampo();

					const nome = (passo.nome || dados.motorista || '').trim();
					const semNome = !nome || /^n[\u00E3a]o informado$/i.test(nome);
					let txtAuto;
					if (semNome) txtAuto = 'Sem condutor vinculado ao ve\u00EDculo.';
					else if (!telMot) txtAuto = 'Sem contato do condutor cadastrado.';
					else {
						// o WhatsApp fica aguardando resposta: n\u00E3o se afirma \u201Csem sucesso\u201D por ele
						const tel = formatarExibicaoNumero(telMot);
						const fixo = `Tentativa de contato via fixo com o condutor ${nome} ${tel} sem sucesso.`;
						if (!usouLigar && usouWpp) txtAuto = `Mensagem enviada via WhatsApp para o condutor ${nome} ${tel}, aguardando retorno.`;
						else if (usouLigar && usouWpp) txtAuto = `${fixo} Mensagem enviada via WhatsApp, aguardando retorno.`;
						else txtAuto = fixo;
					}
					txtAuto = txtAuto.replace(/\s+/g, ' ').trim();

					/* A nota de pernoite vale quando o contato N\u00C3O foi tentado \u2014 a
					   frota restringe a liga\u00E7\u00E3o nesse hor\u00E1rio. Se o operador ligou
					   ou mandou mensagem (o ve\u00EDculo pode estar rodando), o que vale
					   \u00E9 o registro da tentativa.                                  */
					const nota = notaPernoite(dados.cliente);
					const tentouContato = usouLigar || usouWpp;
					let anotacao, dsObs;
					if (nota && !tentouContato) {
						anotacao = txtCampo || nota;
						dsObs    = txtCampo.length >= 10 ? txtCampo : nota;
					} else {
						anotacao = txtCampo || txtAuto;
						dsObs    = txtCampo.length >= 10 ? txtCampo : txtAuto;
					}
					if (anotacao) sessTrat(dados.cd_veiculo).contato = anotacao;
					executarPasso(occ, passo, '2', dsObs, (anotarMarcado() && anotacao) ? anotacao : '');
				};
			} else if (tipo === 'formalizar') {
				// SIM: registra o passo e (se marcado) a anotacao "informado via grupo" no veiculo
				if (el('tr-sim')) el('tr-sim').onclick = () => {
					const obs = obsCampo();
					executarPasso(occ, passo, '1', obs, anotarMarcado() ? obs : '');
				};
				if (el('tr-nao')) el('tr-nao').onclick = () => executarPasso(occ, passo, '2', obsCampo(), '');
			} else {
				if (el('tr-sim')) el('tr-sim').onclick = () => executarPasso(occ, passo, '1', obsCampo(), '');
				if (el('tr-nao')) el('tr-nao').onclick = () => executarPasso(occ, passo, '2', obsCampo(), '');
			}
		}

		/* Passos iguais em ocorr\u00EAncias diferentes t\u00EAm o mesmo r\u00F3tulo (mudando s\u00F3 o
		   n\u00FAmero na frente). A decis\u00E3o tomada num pode ser repetida no outro \u2014
		   sem refazer a anota\u00E7\u00E3o, que j\u00E1 foi registrada na primeira ocorr\u00EAncia.  */
		const chavePasso = label => String(label || '')
			.replace(/^\s*\d+\s*[-.\u2013]?\s*/, '')
			.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
			.replace(/\s+/g, ' ').trim().toUpperCase();

		// a decis\u00E3o s\u00F3 serve se veio de OUTRA ocorr\u00EAncia da placa
		const decisaoDoPasso = (label, cdAtuaAtual) => {
			try {
				const d = (sessTrat(dados.cd_veiculo).decisoes || {})[chavePasso(label)] || null;
				if (!d) return null;
				if (cdAtuaAtual && d.cdAtua === cdAtuaAtual) return null;
				return d;
			} catch (e) { return null; }
		};

		async function executarPasso(occ, passo, cdSucesso, obs, comentarioVeiculo) {
			const c = corpo(); if (!c) return;
			obs = String(obs || '').replace(/['"]/g, '').trim();
			if (obs.length < 10) { alert('A observa\u00E7\u00E3o precisa ter pelo menos 10 caracteres.'); return; }

			c.querySelectorAll('button').forEach(b => b.disabled = true);
			const sim = D.getElementById('tr-sim'); if (sim) sim.textContent = '\u23F3 Registrando...';

			try {
				await registrarPasso(occ.cdAtua, cdSucesso, passo.acao || occ.acao, obs, dados.cd_veiculo);

				// guarda a decis\u00E3o para repetir em outra ocorr\u00EAncia com o MESMO passo
				try {
					const ss = sessTrat(dados.cd_veiculo);
					ss.decisoes = ss.decisoes || {};
					ss.decisoes[chavePasso(occ.passoLabel)] = {
						cdSucesso: cdSucesso, obs: obs, rotulo: occ.passoLabel, cdAtua: occ.cdAtua };
				} catch (e) { }

				// anotacao(oes) no veiculo (comentarios), quando solicitada(s)
				const coms = Array.isArray(comentarioVeiculo)
					? comentarioVeiculo.filter(x => x && String(x).trim())
					: ((comentarioVeiculo && String(comentarioVeiculo).trim()) ? [String(comentarioVeiculo).trim()] : []);
				for (const com of coms) {
					try {
						const r = await enviarComentarioVeiculo(String(com).trim(), dados.cd_veiculo);
						if (r.indexOf('inserido com sucesso') === -1) {
							console.warn('[TRATAR] anota\u00E7\u00E3o no ve\u00EDculo sem confirma\u00E7\u00E3o:', r.slice(0, 200));
						} else {
							console.log('[TRATAR] anota\u00E7\u00E3o registrada no ve\u00EDculo:', com);
						}
					} catch (eCom) {
						console.error('[TRATAR] erro ao registrar anota\u00E7\u00E3o no ve\u00EDculo:', eCom);
						alert('O passo foi registrado, mas uma anota\u00E7\u00E3o no ve\u00EDculo falhou. Veja o console (F12).');
					}
				}

				const lista = await buscarListaOcorrencias(dados.cd_veiculo, dados.cd_proprietario);
				T.__acListaAtual = lista;
				const prox = lista.ocorrencias.find(o => o.cdAtua === occ.cdAtua);

				if (!prox) {
					c.innerHTML = '<div style="padding:14px;color:#2e7d32;font-size:14px;">\u2714 Ocorr\u00EAncia conclu\u00EDda / removida da lista.</div>' +
						'<div style="text-align:center;margin-top:10px;"><button id="tr-voltar2" style="background:#00695C;color:#fff;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;">Voltar \u00E0 lista</button></div>';
					D.getElementById('tr-voltar2').onclick = () => carregarLista();
					return;
				}
				if (prox.reagendar) { telaReagendar(prox, lista.dtReag); return; }
				if (prox.acao && prox.acao === occ.acao && prox.passoLabel === occ.passoLabel) {
					alert('O passo n\u00E3o avan\u00E7ou (o sistema manteve o mesmo passo). Confira no console.');
					carregarLista();
					return;
				}
				abrirPasso(prox);
			} catch (e) {
				console.error('[TRATAR] erro ao gravar passo:', e);
				alert('Erro ao registrar o passo: ' + (e && e.message ? e.message : 'ver console (F12).'));
				carregarLista();
			}
		}

		/* ---------- BAIXA SEM TRATATIVA ----------
		   Marca todos os passos restantes como N\u00C3O e N\u00C3O registra nenhuma
		   anota\u00E7\u00E3o no ve\u00EDculo. Uso: alerta falso ou que dispensa tratativa.
		   A observa\u00E7\u00E3o de cada passo \u00E9 a pr\u00F3pria pr\u00E9-preenchida pelo sistema. */
		const BAIXA_MAX_PASSOS = 15;   // trava de seguran\u00E7a contra la\u00E7o infinito

		async function baixarSemTratativa(occ) {
			const c = corpo(); if (!c) return;
			if (ehPernoiteIgnorada(occ.alerta)) {
				alert('"' + occ.alerta + '" \u00E9 um processo autom\u00E1tico do sistema \u2014 n\u00E3o deve ser tratado.');
				return;
			}
			if (!confirm(`Baixar "${occ.alerta || 'ocorr\u00EAncia'}" sem tratativa?\n\n` +
				'Todos os passos restantes ser\u00E3o marcados como N\u00C3O e NENHUMA anota\u00E7\u00E3o ser\u00E1 feita na placa.\n\n' +
				'Use apenas quando:\n' +
				'\u2022 o alerta for falso ou dispensar tratativa;\n' +
				'\u2022 a frota tiver solicitado desconsiderar a ocorr\u00EAncia;\n' +
				'\u2022 voc\u00EA j\u00E1 tiver feito as anota\u00E7\u00F5es manualmente na placa;\n' +
				'\u2022 voc\u00EA tiver inclu\u00EDdo libera\u00E7\u00E3o de sensor defeituoso.')) return;

			c.innerHTML = '\u23F3 Baixando a ocorr\u00EAncia...';
			let atual = occ, passos = 0;
			try {
				while (passos < BAIXA_MAX_PASSOS) {
					const cdClifor = (T.__acListaAtual && T.__acListaAtual.cdClifor) || dados.cd_proprietario;
					const passo = await buscarPassoTratamento(atual.acao, atual.cdAtua, cdClifor, dados.cd_veiculo, atual.cdMotorista);

					let obs = String(passo.ds_obs || '').replace(/['"]/g, '').trim();
					if (obs.length < 10) obs = 'Sem tratativa necess\u00E1ria para esta ocorr\u00EAncia.';

					passos++;
					c.innerHTML = `\u23F3 Baixando a ocorr\u00EAncia... passo ${passos}` +
						(atual.passoLabel ? `<div style="font-size:12px;color:#777;margin-top:6px;">${escHtml(atual.passoLabel)}</div>` : '');

					await registrarPasso(atual.cdAtua, '2', passo.acao || atual.acao, obs, dados.cd_veiculo);

					const lista = await buscarListaOcorrencias(dados.cd_veiculo, dados.cd_proprietario);
					T.__acListaAtual = lista;
					const prox = lista.ocorrencias.find(o => o.cdAtua === atual.cdAtua);

					if (!prox) {                       // sumiu da lista: conclu\u00EDda
						c.innerHTML = `<div style="padding:14px;color:#2e7d32;font-size:14px;">\u2714 Ocorr\u00EAncia baixada sem tratativa (${passos} passo(s) marcados como N\u00C3O).</div>` +
							'<div style="text-align:center;margin-top:10px;"><button id="tr-voltar3" style="background:#00695C;color:#fff;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;">Voltar \u00E0 lista</button></div>';
						D.getElementById('tr-voltar3').onclick = () => carregarLista();
						return;
					}
					if (prox.reagendar) { telaReagendar(prox, lista.dtReag); return; }   // s\u00F3 falta reagendar
					if (prox.acao === atual.acao && prox.passoLabel === atual.passoLabel) {
						alert('O passo n\u00E3o avan\u00E7ou (o sistema manteve o mesmo passo). Baixa interrompida.');
						carregarLista();
						return;
					}
					atual = prox;
				}
				alert('Muitos passos seguidos (' + BAIXA_MAX_PASSOS + '). Baixa interrompida por seguran\u00E7a.');
				carregarLista();
			} catch (e) {
				console.error('[TRATAR] erro ao baixar sem tratativa:', e);
				alert('Erro ao baixar a ocorr\u00EAncia: ' + (e && e.message ? e.message : 'ver console (F12).'));
				carregarLista();
			}
		}

		/* Repete, nesta ocorr\u00EAncia, as decis\u00F5es j\u00E1 tomadas em passos iguais.
		   Para no primeiro passo diferente e devolve o operador \u00E0 tela dele.
		   Nunca repete anota\u00E7\u00E3o no ve\u00EDculo.                                    */
		async function repetirTratativa(occ) {
			const c = corpo(); if (!c) return;
			const dec0 = decisaoDoPasso(occ.passoLabel, occ.cdAtua);
			if (!dec0) { alert('Este passo ainda n\u00E3o foi tratado em outra ocorr\u00EAncia desta placa.'); return; }
			if (!confirm(`Repetir em "${occ.alerta || 'ocorr\u00EAncia'}" as respostas j\u00E1 dadas nos passos iguais?\n\n` +
				'A anota\u00E7\u00E3o N\u00C3O ser\u00E1 repetida \u2014 ela j\u00E1 foi registrada na primeira ocorr\u00EAncia.\n' +
				'Se aparecer um passo diferente, o tratamento para nele para voc\u00EA decidir.')) return;

			let atual = occ, n = 0;
			try {
				while (n < BAIXA_MAX_PASSOS) {
					const dec = decisaoDoPasso(atual.passoLabel, atual.cdAtua);
					if (!dec) {                       // passo diferente: o operador assume
						c.innerHTML = `<div style="padding:14px;color:#00544a;">\u2714 ${n} passo(s) repetido(s).` +
							`<div style="font-size:12px;color:#555;margin-top:6px;">O passo <b>${escHtml(atual.passoLabel || '')}</b> ` +
							'ainda n\u00E3o foi tratado nesta placa \u2014 abrindo para voc\u00EA decidir...</div></div>';
						setTimeout(() => abrirPasso(atual), 900);
						return;
					}
					n++;
					c.innerHTML = `\u23F3 Repetindo... passo ${n}` +
						`<div style="font-size:12px;color:#777;margin-top:6px;">${escHtml(atual.passoLabel || '')} \u2014 ` +
						`${dec.cdSucesso === '1' ? 'SIM' : 'N\u00C3O'}</div>`;

					const cdClifor = (T.__acListaAtual && T.__acListaAtual.cdClifor) || dados.cd_proprietario;
					const passo = await buscarPassoTratamento(atual.acao, atual.cdAtua, cdClifor, dados.cd_veiculo, atual.cdMotorista);
					let obs = String(passo.ds_obs || '').replace(/['"]/g, '').trim();
					if (obs.length < 10) obs = dec.obs;                     // usa a mesma do passo anterior
					if (!obs || obs.length < 10) obs = 'Tratativa registrada na ocorr\u00EAncia anterior desta placa.';

					await registrarPasso(atual.cdAtua, dec.cdSucesso, passo.acao || atual.acao, obs, dados.cd_veiculo);

					const lista = await buscarListaOcorrencias(dados.cd_veiculo, dados.cd_proprietario);
					T.__acListaAtual = lista;
					const prox = lista.ocorrencias.find(o => o.cdAtua === atual.cdAtua);
					if (!prox) { carregarLista(); return; }                  // conclu\u00EDda
					if (prox.reagendar) { telaReagendar(prox, lista.dtReag); return; }
					if (prox.passoLabel === atual.passoLabel) {              // n\u00E3o avan\u00E7ou
						alert('O passo n\u00E3o avan\u00E7ou. Repeti\u00E7\u00E3o interrompida.');
						carregarLista(); return;
					}
					atual = prox;
				}
				alert('Muitos passos seguidos. Repeti\u00E7\u00E3o interrompida por seguran\u00E7a.');
				carregarLista();
			} catch (e) {
				console.error('[TRATAR] erro ao repetir:', e);
				alert('Erro ao repetir a tratativa: ' + (e && e.message ? e.message : 'ver console (F12).'));
				carregarLista();
			}
		}

		// ---------- TELA 3: REAGENDAR ----------
		function telaReagendar(occ, dtReag) {
			ajustarTamanhoJanela(false);
			const c = corpo(); if (!c) return;
			const dt = dtReag || (T.__acListaAtual && T.__acListaAtual.dtReag) || '';
			const podeEditar = podeEditarReagendamento();
			const usuario = podeEditar ? usuarioAtual() : '';

			c.innerHTML =
				`<div style="font-weight:bold;font-size:14px;color:#00544a;margin-bottom:2px;">${escHtml(occ.alerta || 'Ocorr\u00EAncia')}</div>` +
				'<div style="background:#f3e5f5;border:1px solid #ce93d8;border-radius:6px;padding:10px 12px;margin:8px 0;font-size:13px;color:#6A1B9A;">' +
				'\u2705 Todos os passos foram tratados. Falta apenas <b>reagendar</b> para finalizar.' +
				'</div>' +
				(podeEditar
					? '<div style="font-size:12px;color:#333;margin-bottom:4px;">Data/hora do reagendamento (<b>edit\u00E1vel</b>):</div>' +
					  `<input id="tr-dtreag" type="text" value="${escAttr(dt)}" placeholder="DD/MM/AAAA HH:MM" maxlength="16" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #ab47bc;border-radius:6px;font-size:13px;background:#fff;color:#222;">` +
					  '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">' +
					  ['30 min', '1 h', '2 h', '4 h'].map((r, i) =>
						`<button type="button" class="tr-mais" data-min="${[30, 60, 120, 240][i]}" style="background:#f3e5f5;border:1px solid #ce93d8;color:#6A1B9A;border-radius:14px;padding:4px 10px;font-size:11px;cursor:pointer;">+${r}</button>`).join('') +
					  '<button type="button" id="tr-sistema" style="background:#eee;border:1px solid #ccc;color:#555;border-radius:14px;padding:4px 10px;font-size:11px;cursor:pointer;">Hor\u00E1rio do sistema</button>' +
					  '</div>' +
					  `<div style="margin-top:6px;font-size:11px;color:#888;">Edi\u00E7\u00E3o liberada para <b>${escHtml(usuario)}</b>. Deixe como est\u00E1 para usar o hor\u00E1rio do sistema.</div>`
					: '<div style="font-size:12px;color:#333;margin-bottom:4px;">Data/hora do reagendamento (definida pelo sistema):</div>' +
					  `<input id="tr-dtreag" type="text" value="${escAttr(dt)}" readonly disabled style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px;background:#eee;color:#555;cursor:not-allowed;">` +
					  '<div style="margin-top:6px;font-size:11px;color:#888;">O hor\u00E1rio \u00E9 fornecido pelo sistema e n\u00E3o pode ser alterado.</div>') +
				'<div style="display:flex;gap:10px;justify-content:center;margin-top:14px;">' +
				'<button id="tr-reag-ok" style="background:#6A1B9A;color:#fff;border:none;border-radius:8px;padding:12px 26px;font-weight:bold;font-size:14px;cursor:pointer;">\u21BB Reagendar e finalizar</button>' +
				'<button id="tr-reag-voltar" style="background:transparent;border:1px solid #ccc;border-radius:8px;padding:12px 20px;cursor:pointer;">Voltar</button>' +
				'</div>';

			if (podeEditar) {
				const campo = D.getElementById('tr-dtreag');
				const p2 = n => String(n).padStart(2, '0');
				c.querySelectorAll('.tr-mais').forEach(b => {
					b.onclick = () => {
						const d = new Date(Date.now() + parseInt(b.dataset.min, 10) * 60000);
						campo.value = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
					};
				});
				D.getElementById('tr-sistema').onclick = () => { campo.value = dt; };
			}

			D.getElementById('tr-reag-voltar').onclick = () => carregarLista();
			D.getElementById('tr-reag-ok').onclick = async () => {
				const btn = D.getElementById('tr-reag-ok');
				const voltar = () => { btn.disabled = false; btn.textContent = '\u21BB Reagendar e finalizar'; };

				// data/hora digitada pelo operador autorizado (vazia = usa a do sistema)
				let dtManual = '';
				if (podeEditar) {
					dtManual = (D.getElementById('tr-dtreag')?.value || '').trim();
					if (dtManual && dtManual !== (dt || '').trim()) {
						const d = parseDataBR(dtManual);
						const bate = d &&
							d.getDate() === +dtManual.slice(0, 2) &&
							(d.getMonth() + 1) === +dtManual.slice(3, 5) &&
							d.getHours() === +dtManual.slice(11, 13) &&
							d.getMinutes() === +dtManual.slice(14, 16);
						if (!/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/.test(dtManual) || !bate) {
							alert('Data/hora inv\u00E1lida. Use o formato DD/MM/AAAA HH:MM.');
							return;
						}
						if (d.getTime() < Date.now() - 60000 &&
							!confirm('A data/hora informada j\u00E1 passou:\n\n' + dtManual + '\n\nDeseja reagendar assim mesmo?')) return;
					} else {
						dtManual = '';
					}
				}

				btn.disabled = true; btn.textContent = '\u23F3 Reagendando...';
				try {
					// rebusca a lista para usar o dt_reag ATUAL do sistema (evita valor defasado)
					const lista = await buscarListaOcorrencias(dados.cd_veiculo, dados.cd_proprietario);
					T.__acListaAtual = lista;
					const atual = lista.ocorrencias.find(o => o.cdAtua === occ.cdAtua) || occ;
					const dtVal = dtManual || (lista.dtReag || dt || '').trim();

					if (!/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/.test(dtVal)) {
						alert('O sistema n\u00E3o forneceu a data/hora de reagendamento. Atualize a lista e tente novamente.');
						voltar();
						return;
					}
					if (dtManual) console.log('[TRATAR] reagendamento manual:', dtManual, '(sistema sugeria', (lista.dtReag || dt || '\u2014') + ')');
					if (!atual.reagendar) {
						alert('Esta ocorr\u00EAncia n\u00E3o est\u00E1 mais no passo de reagendar. A lista ser\u00E1 atualizada.');
						carregarLista();
						return;
					}
					await reagendarOcorrencia(atual.cdAtua, atual.cdEvento || occ.cdEvento, dados.cd_veiculo, dtVal);
					carregarLista();
				} catch (e) {
					console.error('[TRATAR] erro ao reagendar:', e);
					alert('Erro ao reagendar. Veja o console (F12).');
					btn.disabled = false; btn.textContent = '\u21BB Reagendar e finalizar';
				}
			};
		}

		carregarLista();
	}

	/* =========================================================
	   3h. PUNI\u00C7\u00D5ES POR EXCESSO DE VELOCIDADE
	   ========================================================= */
	const GET_PADRAO = {
		headers: {
			"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
			"upgrade-insecure-requests": "1"
		},
		method: "GET", mode: "cors", credentials: "include"
	};

	// o portal mistura windows-1252 (telas antigas) e UTF-8 (grid novo):
	// tenta UTF-8 e, se aparecer caractere inv\u00E1lido, cai para windows-1252
	async function getTexto(url) {
		const res = await fetch(url, GET_PADRAO);
		const buf = await res.arrayBuffer();
		const utf8 = new TextDecoder('utf-8').decode(buf);
		if (utf8.indexOf('\uFFFD') === -1) return utf8;
		return new TextDecoder('windows-1252').decode(buf);
	}

	// normaliza nome/placa para casar o relat\u00F3rio com os selects do cadastro
	function chaveCadastro(s) {
		return String(s || '')
			.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
			.replace(/\s+/g, ' ').trim().toUpperCase();
	}

	function urlRelatorioVelocidades(cfg, dtIni, dtFim, velocidade, cdTipo) {
		const vel = String(velocidade || cfg.velocidade).replace(/\D/g, '') || cfg.velocidade;
		return `${URL_REL_VELOC}?tp=1&cd_clifor=${cfg.cdClifor}&cd_veiculo=&dt_ini=${dtIni}&dt_fim=${dtFim}` +
			`&vl_velocidade=${vel}&cd_tipo=${cdTipo || cfg.cdTipo}`;
	}

	// tabela id='grid': Motorista | Placa | Quantidade (a \u00FAltima linha \u00E9 o total)
	const RE_PLACA = /^[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}$/i;
	function parseRelatorioVelocidades(html) {
		const linhas = [];
		try {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			const grid = doc.querySelector('#grid') || doc;
			grid.querySelectorAll('tbody tr').forEach(tr => {
				const tds = tr.querySelectorAll('td');
				if (tds.length < 3) return;
				const motorista = (tds[0].textContent || '').replace(/\s+/g, ' ').trim();
				const placa     = (tds[1].textContent || '').replace(/\s+/g, ' ').trim().toUpperCase();
				const qtd       = parseInt((tds[2].textContent || '').replace(/\D/g, ''), 10);
				if (!motorista || !isFinite(qtd)) return;
				if (/total/i.test(motorista) || !RE_PLACA.test(placa)) return; // rodap\u00E9 de totais
				linhas.push({ motorista, placa, qtd });
			});
		} catch (e) { console.error('[PUNICOES] falha ao ler o relat\u00F3rio:', e); }
		return linhas.sort((a, b) => b.qtd - a.qtd);
	}

	// <OPTION VALUE='1167888'>SPH-4B36</OPTION>  ->  { 'SPH-4B36': '1167888' }
	async function mapaOptions(urlBase, cdClifor) {
		const html = await getTexto(`${urlBase}?cd_clifor=${encodeURIComponent(cdClifor)}`);
		const mapa = {};
		const re = /<option\s+value=['"](\d+)['"][^>]*>([^<]*)</gi;
		let m;
		while ((m = re.exec(html)) !== null) {
			const chave = chaveCadastro(m[2]);
			if (chave && !mapa[chave]) mapa[chave] = m[1];
		}
		return mapa;
	}

	async function registrarPunicao(p) {
		// datas seguem com as barras literais, como o portal envia
		const url = `${URL_PUN_ACAO}?Tipo=I&cd_punicao=&cd_proprietario=${p.cdClifor}&cd_tipo=${p.cdTipo || '1'}` +
			`&cd_motorista=${p.cdMotorista}&cd_veiculo=${p.cdVeiculo}&dt_evento=${p.dtEvento}` +
			`&cd_tempo=${p.horas}&dt_limite=${p.dtLimite}`;
		const txt = await getTexto(url);
		return /realizada com sucesso/i.test(txt);
	}

	function somarDias(dtBR, dias) {
		const m = String(dtBR || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
		if (!m) return '';
		const d = new Date(+m[3], +m[2] - 1, +m[1] + dias);
		const p2 = n => String(n).padStart(2, '0');
		return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
	}

	function dataOntemBR() {
		const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
		const p2 = n => String(n).padStart(2, '0');
		return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
	}

	// abre o relat\u00F3rio numa aba e chama a impress\u00E3o (o navegador oferece "Salvar como PDF")
	function salvarRelatorioPdf(cfg, dt, velocidade) {
		const nome = dt.replace(/\//g, '-');   // dia-m\u00EAs-ano
		// PDF do cliente = relat\u00F3rio DETALHADO, n\u00E3o o de contagem de picos
		const w = T.open(urlRelatorioVelocidades(cfg, dt, dt, velocidade, CD_TIPO_DETALHADO), '_blank');
		if (!w) { alert('O navegador bloqueou a janela do relat\u00F3rio. Libere os pop-ups para este site.'); return; }
		const imprimir = () => {
			try { w.document.title = nome; } catch (e) { }
			setTimeout(() => { try { w.focus(); w.print(); } catch (e) { } }, 400);
		};
		try {
			if (w.document && w.document.readyState === 'complete') imprimir();
			else w.addEventListener('load', imprimir);
		} catch (e) { setTimeout(imprimir, 1500); }
	}

	// mapa da placa numa janela pr\u00F3pria (usado no "Aguardando puni\u00E7\u00E3o")
	/* Print do mapa para a \u00E1rea de transfer\u00EAncia.
	   O mapa \u00E9 desenhado com tiles de outro dom\u00EDnio, o que impede copiar o
	   canvas direto (o navegador bloqueia por seguran\u00E7a). Ent\u00E3o usamos a
	   captura de tela do pr\u00F3prio navegador: ele pede a permiss\u00E3o, tiramos um
	   quadro, recortamos a \u00E1rea do mapa e copiamos como imagem.              */
	/* Print desenhado no pr\u00F3prio navegador (sem pedir captura de tela).
	   S\u00F3 funciona porque a camada padr\u00E3o do mapa \u00E9 o OpenStreetMap, que serve
	   as imagens com CORS. Camadas do Google bloqueiam a exporta\u00E7\u00E3o do canvas \u2014
	   nesse caso caímos na captura de tela.                                    */
	async function printDoMapaLeaflet(iframe) {
		const w = iframe.contentWindow, doc = iframe.contentDocument;
		if (!w || !doc || !w.mymap || !w.L) throw new Error('mapa n\u00E3o acess\u00EDvel');

		const painel = doc.querySelector('#mapid');
		if (!painel) throw new Error('painel do mapa n\u00E3o encontrado');
		const larg = painel.clientWidth, alt = painel.clientHeight;

		const cv = doc.createElement('canvas');
		cv.width = larg; cv.height = alt;
		const ctx = cv.getContext('2d');
		ctx.fillStyle = '#e8eef2'; ctx.fillRect(0, 0, larg, alt);

		// 1) tiles: desenha cada imagem j\u00E1 carregada, na posi\u00E7\u00E3o em que est\u00E1
		const baseRect = painel.getBoundingClientRect();
		const imgs = Array.from(doc.querySelectorAll('#mapid img'));
		const mesmaOrigem = src => { try { return new w.URL(src, w.location.href).origin === w.location.origin; } catch (e) { return false; } };
		const carregar = img => new Promise(res => {
			const externa = !mesmaOrigem(img.src);
			const novo = new w.Image();
			if (externa) novo.crossOrigin = 'anonymous';
			novo.onload = () => res(novo);
			novo.onerror = () => res(null);
			// tile j\u00E1 em cache foi baixado SEM CORS: um par\u00E2metro novo for\u00E7a
			// o navegador a buscar de novo, agora com o cabe\u00E7alho que precisamos
			let alvo = img.src;
			if (externa) {
				try {                                   // monta com URL para n\u00E3o quebrar query existente
					const u = new w.URL(img.src, w.location.href);
					u.searchParams.set('copPrint', Date.now());
					alvo = u.toString();
				} catch (e) { alvo = img.src + (img.src.indexOf('?') === -1 ? '?' : '&') + 'copPrint=' + Date.now(); }
			}
			novo.src = alvo;
			setTimeout(() => res(null), 4000);   // tile lento n\u00E3o trava o print
		});
		const prontas = await Promise.all(imgs.map(carregar));
		let tiles = 0, tilesOk = 0;
		imgs.forEach((img, i) => {
			const fonte = prontas[i];
			const externa = !mesmaOrigem(img.src);
			if (externa) tiles++;
			if (!fonte) return;
			if (externa) tilesOk++;
			const r = img.getBoundingClientRect();
			try {
				ctx.globalAlpha = parseFloat(w.getComputedStyle(img).opacity || 1);
				ctx.drawImage(fonte, r.left - baseRect.left, r.top - baseRect.top, r.width, r.height);
			} catch (e) { }
		});
		ctx.globalAlpha = 1;
		console.log('[MAPA] tiles no print: ' + tilesOk + '/' + tiles);
		// sem nenhum tile o print sai s\u00F3 com os tra\u00E7ados: melhor cair na captura de tela
		if (tiles > 0 && tilesOk === 0) throw new Error('tiles do mapa n\u00E3o puderam ser lidos');

		// 2) tra\u00E7ados e c\u00EDrculos (SVG do Leaflet)
		const svg = painel.querySelector('svg');
		if (svg) {
			const clone = svg.cloneNode(true);
			const r = svg.getBoundingClientRect();
			clone.setAttribute('width', r.width); clone.setAttribute('height', r.height);
			const url = 'data:image/svg+xml;base64,' + w.btoa(unescape(encodeURIComponent(
				new w.XMLSerializer().serializeToString(clone))));
			const imgSvg = await new Promise(res => {
				const im = new w.Image();
				im.onload = () => res(im); im.onerror = () => res(null);
				im.src = url;
			});
			if (imgSvg) { try { ctx.drawImage(imgSvg, r.left - baseRect.left, r.top - baseRect.top); } catch (e) { } }
		}

		return await new Promise((res, rej) =>
			cv.toBlob(b => b ? res(b) : rej(new Error('canvas bloqueado')), 'image/png'));
	}

	async function copiarPrintDoMapa(iframe, btn) {
		const original = btn ? btn.textContent : '';
		const status = t => { if (btn) btn.textContent = t; };
		// 1\u00AA tentativa: desenhar o mapa aqui mesmo (instant\u00E2neo, sem permiss\u00E3o)
		try {
			btn && (btn.disabled = true);
			status('\u23F3 Gerando print...');
			const blob = await printDoMapaLeaflet(iframe);
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
			status('\u2714 Print copiado!');
			console.log('[MAPA] print gerado localmente (OpenStreetMap)');
			setTimeout(() => { if (btn) { btn.textContent = original; btn.disabled = false; } }, 2200);
			return;
		} catch (e) {
			console.warn('[MAPA] print local indispon\u00EDvel, usando captura de tela:', e && e.message);
		}

		if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
			status('\u2716 Falhou');
			alert('N\u00E3o consegui gerar o print do mapa.\n\nUse a Ferramenta de Captura do Windows (Win+Shift+S) sobre o mapa.');
			setTimeout(() => { if (btn) { btn.textContent = original; btn.disabled = false; } }, 2200);
			return;
		}

		let stream;
		try {
			status('\u23F3 Selecione a aba...');
			stream = await navigator.mediaDevices.getDisplayMedia({
				video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true
			});
			const track = stream.getVideoTracks()[0];
			await new Promise(r => setTimeout(r, 350));           // deixa o quadro estabilizar

			const bitmap = await new (T.ImageCapture || window.ImageCapture)(track).grabFrame();
			const r = iframe.getBoundingClientRect();
			// a captura pode ter escala diferente da janela (zoom / DPI)
			const escalaX = bitmap.width / (T.innerWidth || D.documentElement.clientWidth);
			const escalaY = bitmap.height / (T.innerHeight || D.documentElement.clientHeight);

			const cv = D.createElement('canvas');
			cv.width = Math.round(r.width * escalaX);
			cv.height = Math.round(r.height * escalaY);
			cv.getContext('2d').drawImage(bitmap,
				Math.round(r.left * escalaX), Math.round(r.top * escalaY),
				cv.width, cv.height, 0, 0, cv.width, cv.height);

			const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
			status('\u2714 Print copiado!');
			console.log('[MAPA] print copiado (' + cv.width + 'x' + cv.height + ')');
		} catch (e) {
			console.error('[MAPA] falha ao copiar o print:', e);
			if (e && e.name === 'NotAllowedError') status('\u2716 Permiss\u00E3o negada');
			else {
				status('\u2716 Falhou');
				alert('N\u00E3o consegui copiar o print automaticamente.\n\n' +
					'Use a Ferramenta de Captura do Windows (Win+Shift+S) sobre o mapa.');
			}
		} finally {
			try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (e) { }
			setTimeout(() => { if (btn) { btn.textContent = original; btn.disabled = false; } }, 2200);
		}
	}

	// 1) baixa a puni\u00E7\u00E3o na supervis\u00E3o  2) envia o bloqueio com desbloqueio programado
	//    3) anota na placa. O operador confirma tudo antes.
	/* O mesmo request alterna entre fixar e desfixar o ve\u00EDculo no grid.
	   Fixamos ao punir (para o ve\u00EDculo ficar \u00E0 vista) e desfixamos ao
	   cancelar. Falha aqui n\u00E3o interrompe o fluxo: \u00E9 conveni\u00EAncia visual.  */
	async function alternarFixacaoVeiculo(cdVeiculo) {
		if (!cdVeiculo) return false;
		try {
			await getTexto(`${URL_ACOES_AJAX}?tp=fixarveiculo&cd_veiculo=${encodeURIComponent(cdVeiculo)}`);
			return true;
		} catch (e) {
			console.warn('[PUNICAO] n\u00E3o consegui fixar/desfixar o ve\u00EDculo:', e && e.message);
			return false;
		}
	}

	async function iniciarPunicao(r, btn) {
		const cfg = cfgPunicaoDoCliente(r.empresa || r.cliente);
		if (!cfg) { alert('Frota sem regra de puni\u00E7\u00E3o cadastrada: ' + (r.empresa || '\u2014')); return; }
		if (!r.cdPunicao) { alert('N\u00E3o encontrei o c\u00F3digo da puni\u00E7\u00E3o desta placa na supervis\u00E3o.'); return; }
		if (!r.cdVeiculo) { alert('Placa n\u00E3o encontrada no grid da base.'); return; }

		const p2 = n => String(n).padStart(2, '0');
		/* Dentro do pernoite, a puni\u00E7\u00E3o come\u00E7a no hor\u00E1rio de rodagem (o ve\u00EDculo
		   est\u00E1 parado mesmo, ent\u00E3o s\u00F3 vale a partir da hora em que voltaria a
		   rodar). Fora do pernoite, come\u00E7a agora \u2014 o ve\u00EDculo est\u00E1 sendo impedido
		   de rodar neste momento.                                              */
		const agora = new Date();
		const janPern = janelaMacroFrota(r.empresa) || janelaPernoiteFrota(detectarFrota(r.empresa));
		const noPernoite = dentroDaJanela(janPern);
		/* Velocidade excedida da Rossini (e demais frotas) s\u00F3 pode ser iniciada
		   dentro do hor\u00E1rio de pernoite \u2014 fora dele nem cadastramos.        */
		if (!noPernoite && !punivelForaDoPernoite(r.empresa, r.tipo)) {
			alert(`${r.placa} \u2014 ${r.tipo || 'esta puni\u00E7\u00E3o'} (${r.empresa || '\u2014'})\n\n` +
				'Este tipo s\u00F3 pode ser iniciado dentro do hor\u00E1rio de pernoite da frota.\n' +
				`In\u00EDcio previsto: ${p2(cfg.inicioHora)}h.\n\n` +
				'Tente novamente na madrugada, quando o ve\u00EDculo estiver parado.');
			return;
		}

		let ini;
		if (noPernoite) {
			ini = new Date(agora);
			ini.setHours(cfg.inicioHora, 0, 0, 0);
			if (ini.getTime() <= agora.getTime()) ini.setDate(ini.getDate() + 1);
		} else {
			ini = new Date(agora);
			ini.setSeconds(0, 0);
		}
		// dura\u00E7\u00E3o sugerida pelo tipo, confirmada pelo operador
		const horasSugeridas = horasDaPunicao(cfg, r.tipo);
		const resp = prompt(
			`Dura\u00E7\u00E3o da puni\u00E7\u00E3o de ${r.placa} (${r.tipo || 'tipo n\u00E3o informado'}), em horas:\n\n` +
			'Confira no aviso da transportadora \u2014 o bloqueio ser\u00E1 programado para este tempo.',
			String(horasSugeridas));
		if (resp === null) return;
		const horas = parseFloat(String(resp).replace(',', '.'));
		if (!isFinite(horas) || horas <= 0 || horas > 24) {
			alert('Dura\u00E7\u00E3o inv\u00E1lida. Informe um n\u00FAmero de horas entre 1 e 24.');
			return;
		}
		const fim = new Date(ini.getTime() + horas * 3600000);

		const dataBR = `${p2(ini.getDate())}/${p2(ini.getMonth() + 1)}/${ini.getFullYear()} ${p2(ini.getHours())}:${p2(ini.getMinutes())}`;
		const isoFim = `${fim.getFullYear()}-${p2(fim.getMonth() + 1)}-${p2(fim.getDate())}T${p2(fim.getHours())}:${p2(fim.getMinutes())}`;
		const motivoPun = String(r.tipo || '').trim();
		const dtEvt = dataDoEvento(r);
		const anotacao = `Ve\u00EDculo em puni\u00E7\u00E3o at\u00E9 \u00E0s ${p2(fim.getHours())}:${p2(fim.getMinutes())} horas, N\u00C3O DESBLOQUEAR.` +
			(motivoPun ? ` Motivo: ${motivoPun}` : '') +
			(dtEvt ? ` (evento em ${dtEvt})` : '') + (motivoPun || dtEvt ? '.' : '');

		if (r.__total > 1 && r.__ordem > 1 &&
			!confirm(`\u26A0 ${r.placa} tem ${r.__total} puni\u00E7\u00F5es pendentes e esta \u00E9 a ${r.__ordem}\u00AA.\n\n` +
				'O normal \u00E9 cumprir da mais antiga para a mais recente.\n\nPunir esta mesmo assim?')) return;
		if (!confirm(`Iniciar puni\u00E7\u00E3o de ${r.placa} (${cfg.nome})?\n\n` +
			`In\u00EDcio: ${dataBR}${noPernoite
				? (dentroDaJanela(janPern) ? ' (hor\u00E1rio de rodagem da frota)' : ' \u2014 este tipo sempre inicia \u00E0s ' + p2(cfg.inicioHora) + 'h')
				: ' (agora)'}\n` +
			`Fim: ${p2(fim.getDate())}/${p2(fim.getMonth() + 1)} \u00E0s ${p2(fim.getHours())}:${p2(fim.getMinutes())} (${horas}h)\n` +
			`Comando: ${cfg.comando.label}\n\n` +
			`Ser\u00E3o feitos:\n\u2022 baixa da puni\u00E7\u00E3o na supervis\u00E3o\n\u2022 bloqueio com desbloqueio autom\u00E1tico\n` +
			`\u2022 anota\u00E7\u00E3o na placa\n\u2022 fixa\u00E7\u00E3o do ve\u00EDculo no grid`)) return;

		const original = btn ? btn.textContent : '';
		if (btn) { btn.disabled = true; btn.textContent = '\u23F3'; }
		const feito = [];
		try {
			// 1) baixar a puni\u00E7\u00E3o
			// o portal envia a data com as barras e os dois-pontos literais
			await getTexto(`${URL_ACOES_AJAX}?tp=baixar_punicao&data=${dataBR.replace(/ /g, '%20')}&cd_punicao=${encodeURIComponent(r.cdPunicao)}`);
			feito.push('puni\u00E7\u00E3o registrada');

			// 2) bloqueio com desbloqueio programado
			const desc = cfg.comando.comProprietario
				? `1 - ${r.placa} (${r.tecnologia || ''})`
				: r.placa;
			const filtro = 'Comando: ' + cfg.comando.label +
				(cfg.comando.comProprietario ? ` | Propriet\u00E1rio: ${r.empresa || cfg.nome}` : '');
			const urlCmd = `${URL_CMD_ACAO}?tp=validar&cd_comando=${encodeURIComponent(cfg.comando.cd)}` +
				`&envio_automatico=1&cd_tempo=&veiculos=${encodeURIComponent(r.cdVeiculo)}` +
				`&data_desbloqueio=${isoFim}` +
				`&filtro=${encodeURIComponent(filtro)}&ds_veiculos=${encodeURIComponent(desc)}`;
			console.log('[PUNICAO] enviando bloqueio:', urlCmd);
			const respCmd = await getTexto(urlCmd);
			const cmdOk = /Envio Realizado com sucesso/i.test(respCmd);
			if (!cmdOk) {
				// o portal recusou ou pediu confirma\u00E7\u00E3o: mostra o que voltou
				const trecho = String(respCmd).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
				console.warn('[PUNICAO] bloqueio sem confirma\u00E7\u00E3o. Resposta:', trecho);
				const mAlert = String(respCmd).match(/alert\('([^']{5,200})'\)/i);
				throw new Error('o portal n\u00E3o confirmou o bloqueio' +
					(mAlert ? ': ' + mAlert[1] : (trecho ? ' \u2014 ' + trecho.slice(0, 120) : '')));
			}
			feito.push('bloqueio enviado (desbloqueio \u00E0s ' + p2(fim.getHours()) + 'h)');

			// 3) anota\u00E7\u00E3o na placa
			await enviarComentarioVeiculo(anotacao, r.cdVeiculo);
			feito.push('anota\u00E7\u00E3o registrada');

			// 4) fixa no grid para o ve\u00EDculo ficar \u00E0 vista durante a puni\u00E7\u00E3o
			if (await alternarFixacaoVeiculo(r.cdVeiculo)) feito.push('ve\u00EDculo fixado no grid');

			r.__punida = { ini: ini, fim: fim, cfg: cfg, horas: horas };
			if (btn) { btn.textContent = '\u2714 punido'; btn.style.color = '#2e7d32'; }
			if (confirm(`\u2714 Puni\u00E7\u00E3o iniciada para ${r.placa}.\n\n` + feito.map(f => '\u2022 ' + f).join('\n') +
				'\n\nGerar o informativo para a transportadora?')) informativoPunicao(r);
		} catch (e) {
			console.error('[PUNICAO] falha ao iniciar:', e);
			alert('Erro ao iniciar a puni\u00E7\u00E3o.\n\nConclu\u00EDdo: ' + (feito.join(', ') || 'nada') +
				'\n\nDetalhe: ' + (e && e.message ? e.message : 'ver console (F12)') +
				'\n\nConfira no portal antes de tentar de novo. O bloqueio pode precisar\n' +
				'ser enviado manualmente pela tela de comandos.');
			if (btn) { btn.disabled = false; btn.textContent = original; }
		}
	}

	/* Cancela a puni\u00E7\u00E3o e cadastra de novo com os mesmos dados, para o condutor
	   ser punido depois. Uso: o ve\u00EDculo n\u00E3o pode ficar no local ou violou o
	   bloqueio.                                                                */
	async function cancelarPunicao(r, btn) {
		if (!r.cdPunicao) { alert('N\u00E3o encontrei o c\u00F3digo da puni\u00E7\u00E3o desta placa.'); return; }
		const cfgPun = PUNICOES_CFG.find(c => c.punir && RE_FROTA_PUN(c, r.empresa));
		if (!cfgPun) { alert('Frota sem regra de puni\u00E7\u00E3o cadastrada: ' + (r.empresa || '\u2014')); return; }

		const motivo = prompt('Por que a puni\u00E7\u00E3o est\u00E1 sendo cancelada?\n\n' +
			'(ex.: ve\u00EDculo n\u00E3o pode permanecer no local / bloqueio violado)', 'Ve\u00EDculo n\u00E3o pode permanecer no local');
		if (motivo === null) return;

		if (!r.tecnologia) r.tecnologia = tecnologiaDaPlaca(r.placa);
		const cmdPrev = cmdLiberarPunicao(r.tecnologia);
		if (!confirm(`Cancelar a puni\u00E7\u00E3o de ${r.placa} e cadastrar novamente?\n\n` +
			`Motivo: ${motivo || '\u2014'}\n\n` +
			`A puni\u00E7\u00E3o atual ser\u00E1 cancelada e uma nova ser\u00E1 cadastrada com os mesmos\n` +
			`dados (${cfgPun.horas}h), para o condutor ser punido depois.\n\n` +
			(cmdPrev
				? `O ve\u00EDculo ser\u00E1 liberado com o comando:\n${cmdPrev.label}`
				: `\u26A0 Sem comando de libera\u00E7\u00E3o cadastrado para ${r.tecnologia || 'esta tecnologia'} \u2014 ` +
				  `libere o ve\u00EDculo manualmente depois.`))) return;

		const original = btn ? btn.textContent : '';
		if (btn) { btn.disabled = true; btn.textContent = '\u23F3'; }
		const feito = [];
		try {
			// 1) cancela (o portal usa POST aqui)
			const resp = await fetch(`${URL_ACOES_AJAX}?tp=cancelar_punicao&cd_punicao=${encodeURIComponent(r.cdPunicao)}`, {
				headers: { "accept": "*/*", "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7" },
				method: "POST", mode: "cors", credentials: "include"
			});
			if (!resp.ok) throw new Error('HTTP ' + resp.status);
			feito.push('puni\u00E7\u00E3o cancelada');

			// 2) recadastra com os mesmos dados
			let cdMotorista = '';
			try {
				const mapaMot = await mapaOptions(URL_PUN_MOTORIST, cfgPun.cdClifor);
				cdMotorista = (acharMotoristaNoCadastro(mapaMot, r.motorista) || {}).cd || '';
			} catch (e) { }
			if (!cdMotorista) throw new Error('motorista "' + r.motorista + '" n\u00E3o encontrado no cadastro');

			/* A nova puni\u00E7\u00E3o \u00E9 a MESMA infra\u00E7\u00E3o, s\u00F3 adiada: mantemos a data do
			   evento e o tipo originais. Se a data original j\u00E1 n\u00E3o der prazo
			   para cobrar, o operador decide se estende.                      */
			const p2 = n => String(n).padStart(2, '0');
			const hoje = new Date();
			const hojeBR = `${p2(hoje.getDate())}/${p2(hoje.getMonth() + 1)}/${hoje.getFullYear()}`;
			let dtEvento = dataDoEvento(r) || hojeBR;
			let dtLimite = somarDias(dtEvento, PUNICAO_PRAZO_DIAS);

			// prazo vencido ou vencendo hoje: pergunta se recadastra com a data de hoje
			const limTs = (() => { const m = dtLimite.match(/(\d{2})\/(\d{2})\/(\d{4})/);
				return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0; })();
			if (limTs && limTs <= hoje.getTime()) {
				if (confirm(`O prazo desta puni\u00E7\u00E3o (evento em ${dtEvento}) vence em ${dtLimite}.\n\n` +
					'Recadastrar com a data de hoje, para dar novo prazo de ' + PUNICAO_PRAZO_DIAS + ' dias?\n\n' +
					'Cancelar mant\u00E9m a data original do evento.')) {
					dtEvento = hojeBR;
					dtLimite = somarDias(dtEvento, PUNICAO_PRAZO_DIAS);
				}
			}

			const cdTipoOrig = tipoDaPunicao(r.tipo);
			const ok = await registrarPunicao({
				cdClifor: cfgPun.cdClifor, cdMotorista: cdMotorista, cdVeiculo: r.cdVeiculo,
				dtEvento: dtEvento, horas: horasDaPunicao(cfgPunicaoDoCliente(r.empresa) || cfgPun, r.tipo) || cfgPun.horas,
				dtLimite: dtLimite, cdTipo: cdTipoOrig
			});
			feito.push(ok
				? `nova puni\u00E7\u00E3o cadastrada: ${r.tipo || 'mesmo tipo'}, ${cfgPun.horas}h, evento ${dtEvento}, prazo at\u00E9 ${dtLimite}`
				: 'nova puni\u00E7\u00E3o enviada, sem confirma\u00E7\u00E3o');

			// 3) libera o ve\u00EDculo: o comando depende da tecnologia
			let cmdTxt = '';
			if (r.cdVeiculo) {
				const cmd = cmdLiberarPunicao(r.tecnologia);
				if (cmd) {
					try {
						const desc = `1 - ${r.placa} (${r.tecnologia || ''})`;
						const filtro = `Comando: ${cmd.label} | Propriet\u00E1rio: ${r.empresa || ''}`;
						const urlCmd = `${URL_CMD_ACAO}?tp=E&veiculos=${encodeURIComponent(r.cdVeiculo)}` +
							`&cd_comando=${encodeURIComponent(cmd.cd)}` +
							`&filtro=${encodeURIComponent(filtro)}&ds_veiculos=${encodeURIComponent(desc)}`;
						const resp = await getTexto(urlCmd);
						const enviou = /Envio Realizado com sucesso/i.test(resp);
						cmdTxt = cmd.label.replace(/^\d+-\d+-/, '');
						feito.push(enviou ? `comando enviado: ${cmdTxt}` : `comando ${cmdTxt} sem confirma\u00E7\u00E3o`);
					} catch (eCmd) {
						console.error('[PUNICAO] falha no comando de libera\u00E7\u00E3o:', eCmd);
						feito.push('\u26A0 falha ao enviar o comando de libera\u00E7\u00E3o');
					}
				} else {
					feito.push(`\u26A0 sem comando de libera\u00E7\u00E3o para ${r.tecnologia || 'esta tecnologia'} \u2014 liberar manualmente`);
				}
			}

			// 4) anota\u00E7\u00E3o do cancelamento na placa
			if (r.cdVeiculo) {
				try {
					await enviarComentarioVeiculo(
						`Puni\u00E7\u00E3o cancelada${motivo ? ': ' + motivo : ''}. ` +
						`Nova puni\u00E7\u00E3o cadastrada para cumprimento posterior.` +
						(cmdTxt ? ` Comando enviado: ${cmdTxt}.` : ''),
						r.cdVeiculo);
					feito.push('anota\u00E7\u00E3o registrada');
				} catch (e) { }
			}

			// desfixa do grid: a puni\u00E7\u00E3o deixou de valer
			if (await alternarFixacaoVeiculo(r.cdVeiculo)) feito.push('ve\u00EDculo desfixado do grid');

			if (btn) { btn.textContent = '\u2714 cancelada'; btn.style.color = '#2e7d32'; }
			alert(`\u2714 ${r.placa}\n\n` + feito.map(f => '\u2022 ' + f).join('\n'));
		} catch (e) {
			console.error('[PUNICAO] falha ao cancelar:', e);
			alert('Erro ao cancelar/recadastrar.\n\nConclu\u00EDdo: ' + (feito.join(', ') || 'nada') +
				'\n\nDetalhe: ' + (e && e.message ? e.message : 'ver console (F12)') +
				'\n\nConfira na supervis\u00E3o antes de tentar de novo.');
			if (btn) { btn.disabled = false; btn.textContent = original; }
		}
	}

	// puni\u00E7\u00E3o cumprida (situa\u00E7\u00E3o em branco na supervis\u00E3o): finaliza para sair da lista
	async function finalizarPunicao(r, btn) {
		if (!r.cdPunicao) { alert('N\u00E3o encontrei o c\u00F3digo da puni\u00E7\u00E3o desta placa.'); return; }
		if (!confirm(`Finalizar a puni\u00E7\u00E3o de ${r.placa}?\n\n` +
			'Use quando o tempo de puni\u00E7\u00E3o j\u00E1 acabou.\n\n' +
			'Ser\u00E3o feitos:\n\u2022 conclus\u00E3o da puni\u00E7\u00E3o (sai da lista)\n' +
			'\u2022 anota\u00E7\u00E3o na placa\n\u2022 desfixa\u00E7\u00E3o do ve\u00EDculo no grid')) return;
		const original = btn ? btn.textContent : '';
		if (btn) { btn.disabled = true; btn.textContent = '\u23F3'; }
		const feito = [];
		try {
			await getTexto(`${URL_ACOES_AJAX}?tp=tratar_punicao&cd_punicao=${encodeURIComponent(r.cdPunicao)}`);
			feito.push('puni\u00E7\u00E3o conclu\u00EDda');

			// anota\u00E7\u00E3o do encerramento na placa
			if (r.cdVeiculo) {
				try {
					const motivoPun = String(r.tipo || '').trim();
					const dtEvt = dataDoEvento(r);
					await enviarComentarioVeiculo(
						'Puni\u00E7\u00E3o finalizada. Ve\u00EDculo liberado para seguir viagem.' +
						(motivoPun ? ` Motivo da puni\u00E7\u00E3o: ${motivoPun}` : '') +
						(dtEvt ? ` (evento em ${dtEvt})` : '') + (motivoPun || dtEvt ? '.' : ''),
						r.cdVeiculo);
					feito.push('anota\u00E7\u00E3o registrada');
				} catch (eAnot) {
					console.error('[PUNICAO] falha ao anotar o encerramento:', eAnot);
				}
				// desfixa do grid: a puni\u00E7\u00E3o terminou
				if (await alternarFixacaoVeiculo(r.cdVeiculo)) feito.push('ve\u00EDculo desfixado do grid');
			}

			if (btn) { btn.textContent = '\u2714 finalizada'; btn.style.color = '#2e7d32'; }
			console.log('[PUNICAO] finalizada:', r.placa, r.cdPunicao, '\u2014', feito.join(', '));
			alert(`\u2714 ${r.placa}\n\n` + feito.map(f => '\u2022 ' + f).join('\n'));
		} catch (e) {
			console.error('[PUNICAO] falha ao finalizar:', e);
			alert('N\u00E3o consegui finalizar.\n\nConclu\u00EDdo: ' + (feito.join(', ') || 'nada') +
				'\n\nVeja o console (F12).');
			if (btn) { btn.disabled = false; btn.textContent = original; }
		}
	}

	/* A c\u00E9lula de localiza\u00E7\u00E3o do grid s\u00F3 vira endere\u00E7o depois que o script do
	   portal roda. Quando lemos o HTML puro, sobra a chamada javascript \u2014 da\u00ED
	   procuramos no grid da tela e, em \u00FAltimo caso, usamos a coordenada.      */
	/* O portal transforma coordenada em endere\u00E7o com um endpoint pr\u00F3prio
	   (o mesmo que a c\u00E9lula do grid chama). Usamos ele para o informativo
	   funcionar mesmo com a placa fora do grid aberto.                       */
	const URL_DESC_POSICAO = 'https://gerenciamento.griscargo.com.br/griscargo/descricao_posicao/';

	// POST com JSON: {id_customer, raio, points:[{id_local, latitude, longitude}]}
	// resposta: [{..., texto: "A 7.49 km de POSTO ... - Pato Branco - PR"}]
	async function descreverPosicao(lat, lon, cdClifor, cdVeiculo) {
		if (!isFinite(lat) || !isFinite(lon)) return '';
		T.__acPosCache = T.__acPosCache || {};
		const chave = `${lat},${lon}`;
		if (T.__acPosCache[chave] !== undefined) return T.__acPosCache[chave];
		let texto = '';
		try {
			const res = await fetch(URL_DESC_POSICAO, {
				headers: {
					"accept": "*/*",
					"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
					"content-type": "application/json;charset=UTF-8"
				},
				body: JSON.stringify({
					id_customer: parseInt(cdClifor, 10) || 0,
					raio: 100,
					points: [{ id_local: parseInt(cdVeiculo, 10) || 0, latitude: +lat, longitude: +lon }]
				}),
				method: "POST", mode: "cors", credentials: "include"
			});
			if (res.ok) {
				const dados = await res.json();
				if (Array.isArray(dados) && dados[0] && dados[0].texto)
					texto = String(dados[0].texto).replace(/\s+/g, ' ').trim();
			}
		} catch (e) {
			console.warn('[POSICAO] n\u00E3o consegui descrever a coordenada:', e && e.message);
		}
		T.__acPosCache[chave] = texto;
		return texto;
	}

	function posicaoLegivel(r) {
		const ruim = t => !t || /buscar_descricao_posicao|javascript/i.test(String(t));
		const limpo = t => String(t || '').replace(/\s+/g, ' ').trim();
		if (!ruim(r.posicao)) return limpo(r.posicao);

		/* A c\u00E9lula do grid s\u00F3 vira endere\u00E7o depois que o portal resolve a
		   coordenada, e o resultado fica em #ds_posicao_{cd_veiculo}. Lemos
		   direto de l\u00E1, percorrendo os frames.                              */
		if (r.cdVeiculo) {
			let achado = '';
			(function walk(j) {
				if (achado) return;
				try {
					const doc = j.document;
					const el = doc && doc.getElementById('ds_posicao_' + r.cdVeiculo);
					if (el && !ruim(el.textContent) && limpo(el.textContent)) { achado = limpo(el.textContent); return; }
					for (let i = 0; i < j.frames.length && !achado; i++) walk(j.frames[i]);
				} catch (e) { }
			})(T);
			if (achado) return achado;
		}

		// 3\u00AA via: acha a LINHA da placa no grid e l\u00EA a c\u00E9lula de localiza\u00E7\u00E3o dela
		let porLinha = '';
		(function walk(j) {
			if (porLinha) return;
			try {
				const doc = j.document;
				if (doc && doc.querySelectorAll) {
					doc.querySelectorAll('tr').forEach(tr => {
						if (porLinha) return;
						const on = tr.getAttribute('onclick') || tr.getAttribute('onmousedown') || '';
						if (on.indexOf("'" + r.placa + "'") === -1) return;
						const td = tr.querySelector('td[data-id="localizacao"]') ||
							tr.querySelector('td[id^="ds_posicao_"]');
						if (td && !ruim(td.textContent) && limpo(td.textContent)) porLinha = limpo(td.textContent);
					});
				}
				for (let i = 0; i < j.frames.length && !porLinha; i++) walk(j.frames[i]);
			} catch (e) { }
		})(T);
		if (porLinha) return porLinha;

		try {
			const naTela = veiculosVisiveisNoGrid().find(v => v.placa === r.placa);
			if (naTela && !ruim(naTela.posicao)) return limpo(naTela.posicao);
		} catch (e) { }

		console.warn('[PUNICAO] endere\u00E7o n\u00E3o encontrado para', r.placa,
			'(cd_veiculo ' + (r.cdVeiculo || '?') + '). A placa est\u00E1 no grid aberto?');
		return '';
	}

	// link do Google Maps para a transportadora abrir o local exato
	function linkGoogle(r) {
		if (isFinite(r.lat) && isFinite(r.lon))
			return `https://www.google.com/maps/search/${r.lat},${r.lon}`;
		try {
			const naTela = veiculosVisiveisNoGrid().find(v => v.placa === r.placa);
			if (naTela && isFinite(naTela.lat) && isFinite(naTela.lon))
				return `https://www.google.com/maps/search/${naTela.lat},${naTela.lon}`;
		} catch (e) { }
		return '';
	}

	/* A lista da supervis\u00E3o mostra o prazo para cobrar, n\u00E3o a data do evento.
	   Como o prazo \u00E9 sempre dt_evento + PUNICAO_PRAZO_DIAS, voltamos os dias
	   para chegar \u00E0 data em que a infra\u00E7\u00E3o aconteceu.                        */
	function dataDoEvento(r) {
		const m = String(r.prazo || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
		if (!m) return '';
		const d = new Date(+m[3], +m[2] - 1, +m[1] - PUNICAO_PRAZO_DIAS);
		const p2 = n => String(n).padStart(2, '0');
		return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
	}

	async function informativoPunicao(r) {
		const p2 = n => String(n).padStart(2, '0');
		const cfg = (r.__punida && r.__punida.cfg) || cfgPunicaoDoCliente(r.empresa) || { horas: 4, inicioHora: 5 };
		let ini, fim;
		if (r.__punida) { ini = r.__punida.ini; fim = r.__punida.fim; }
		else {
			// mesmo crit\u00E9rio do in\u00EDcio da puni\u00E7\u00E3o: 05h s\u00F3 dentro do pernoite
			const agora = new Date();
			const janPern = janelaMacroFrota(r.empresa) || janelaPernoiteFrota(detectarFrota(r.empresa));
			if (dentroDaJanela(janPern) || !punivelForaDoPernoite(r.empresa, r.tipo)) {
				ini = new Date(agora); ini.setHours(cfg.inicioHora, 0, 0, 0);
				if (ini.getTime() <= agora.getTime()) ini.setDate(ini.getDate() + 1);
			} else {
				ini = new Date(agora); ini.setSeconds(0, 0);
			}
			fim = new Date(ini.getTime() + horasDaPunicao(cfg, r.tipo) * 3600000);
		}
		const hm = d => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
		// sem endere\u00E7o no grid: pede ao portal para descrever a coordenada
		let local = posicaoLegivel(r);
		if (!local) local = await descreverPosicao(r.lat, r.lon, r.cdProp, r.cdVeiculo);
		const texto =
			'*Ve\u00EDculo em puni\u00E7\u00E3o*\n\n' +
			`*Placa:* ${r.placa}\n` +
			`*Motorista:* ${r.motorista || '\u2014'}\n` +
			(dataDoEvento(r) ? `*Data do evento:* ${dataDoEvento(r)}\n` : '') +
			`*Local:* ${local || '\u2014'}\n` +
			(linkGoogle(r) ? `${linkGoogle(r)}\n` : '') +
			`*Inicio:* ${hm(ini)}hrs\n` +
			`*Fim:* ${hm(fim)}hrs\n` +
			`*Motivo:* ${r.tipo || 'Velocidade Excedida'}`;
		copiarSilencioso(texto).then(() => {
			alert('Informativo copiado para a \u00E1rea de transfer\u00EAncia \u2714\n\n' + texto);
		}).catch(() => prompt('Copie o informativo abaixo:', texto.replace(/\n/g, ' | ')));
	}

	function abrirMapaPlaca(placa, cdVeiculo, cdClifor, posicao) {
		D.getElementById('modal-mapa-placa')?.remove();
		estiloJanelas();
		const url = `${URL_MAPA}?equip=1&risco=0&liberado=1&trajeto=1&desloc=1&posicionamento=0` +
			'&clifor_clifor=0&postos=0&postosrota=1&riscorota=1&liberadorota=1&paradas=1&macro=1' +
			`&cd_veiculo=${encodeURIComponent(cdVeiculo)}&cd_clifor=${encodeURIComponent(cdClifor || '')}` +
			`&posicao=${encodeURIComponent(posicao || '')}&dhxr${Date.now()}=1`;

		const modal = D.createElement('div');
		modal.id = 'modal-mapa-placa';
		modal.className = 'cop-jan';
		modal.style.cssText =
			'position:fixed;top:6%;left:50%;transform:translateX(-50%);width:900px;max-width:95vw;' +
			'height:76vh;background:#fff;z-index:2147483100;display:flex;flex-direction:column;';
		modal.innerHTML =
			'<div id="mp-header" class="cop-jan-head" style="--cop-acento:#1565C0;cursor:move;display:flex;align-items:center;gap:8px;user-select:none;">' +
			`<span style="flex:1;">\u{1F5FA} ${escHtml(placa)}${posicao ? ' \u2014 ' + escHtml(posicao) : ''}</span>` +
			`<a href="${escAttr(url)}" target="_blank" style="color:#9fc4e8;font-size:11px;text-decoration:none;">nova aba</a>` +
			'<button id="mp-fechar" class="cop-jan-x">\u2716</button></div>' +
			`<iframe src="${escAttr(url)}" style="flex:1;width:100%;border:0;background:#eef2f4;"></iframe>`;
		D.body.appendChild(modal);
		D.getElementById('mp-fechar').onclick = () => modal.remove();
		const h = D.getElementById('mp-header');
		h.onmousedown = (e) => {
			if (e.target.closest('button') || e.target.closest('a')) return;
			const sx = e.clientX - modal.getBoundingClientRect().left;
			const sy = e.clientY - modal.getBoundingClientRect().top;
			const mv = ev => { modal.style.left = (ev.pageX - sx) + 'px'; modal.style.top = (ev.pageY - sy) + 'px'; modal.style.transform = 'none'; };
			const up = () => { D.removeEventListener('mousemove', mv); D.removeEventListener('mouseup', up); };
			D.addEventListener('mousemove', mv); D.addEventListener('mouseup', up);
			e.preventDefault();
		};
	}

	/* ===== PUNI\u00C7\u00D5ES COLADAS (texto da transportadora) =====
	   L\u00EA o aviso que a frota manda no grupo e cadastra as puni\u00E7\u00F5es de uma vez.
	   Formato esperado:
	     N\u00C3O Realizou parada de pernoite do dia 11/08 para 12/08 - A puni\u00E7\u00E3o ser\u00E1 de 11 HORAS
	     * AVR 7C57 - S\u00E9rgio Da Rocha
	   A data do evento \u00E9 o PRIMEIRO dia citado (quando ocorreu a dire\u00E7\u00E3o
	   ininterrupta) e o prazo para cobrar \u00E9 de PUNICAO_PRAZO_DIAS.            */
	const PUNICAO_COLADA_TIPO = '3';   // cd_tipo de dire\u00E7\u00E3o ininterrupta
	// cd_tipo pelo nome que a supervis\u00E3o mostra (para recadastrar igual)
	const PUNICAO_TIPOS = [
		{ re: /ININTERRUPTA|DIRE[C\u00C7][A\u00C3]O/i, cd: '3' },
		{ re: /VELOCIDADE/i,                    cd: '1' }
	];
	const tipoDaPunicao = nome => {
		const t = PUNICAO_TIPOS.find(x => x.re.test(String(nome || '')));
		return t ? t.cd : '1';
	};

	/* O aviso da frota costuma trazer o nome curto ("S\u00E9rgio Da Rocha") e o
	   cadastro o nome completo ("SERGIO DA ROCHA OLIVEIRA"). Aceitamos o
	   cadastro que contenha TODAS as palavras informadas \u2014 e, se mais de um
	   servir, n\u00E3o escolhemos: melhor o operador decidir do que punir o errado. */
	function acharMotoristaNoCadastro(mapa, nome) {
		const exato = mapa[chaveCadastro(nome)];
		if (exato) return { cd: exato, exato: true };

		const palavras = chaveCadastro(nome).split(/\s+/).filter(x => x.length > 1);
		if (palavras.length < 2) return { cd: null, motivo: 'nome muito curto para busca' };

		const candidatos = [];
		Object.keys(mapa).forEach(chave => {
			const alvo = ' ' + chave + ' ';
			if (palavras.every(p => alvo.indexOf(' ' + p + ' ') !== -1)) candidatos.push(chave);
		});
		if (!candidatos.length) return { cd: null, motivo: 'motorista n\u00E3o encontrado no cadastro' };
		if (candidatos.length > 1)
			return { cd: null, motivo: `${candidatos.length} motoristas com esse nome (${candidatos.slice(0, 2).join(' / ')}...)` };
		return { cd: mapa[candidatos[0]], exato: false, nomeCadastro: candidatos[0] };
	}

	function interpretarPunicoesColadas(texto) {
		const t = String(texto || '');
		const out = { horas: null, dtEvento: '', itens: [], avisos: [] };

		// "A puni\u00E7\u00E3o ser\u00E1 de 11 HORAS"
		const mH = t.match(/puni[c\u00E7][a\u00E3]o\s+ser[a\u00E1]\s+de\s+(\d{1,2})\s*h/i) || t.match(/(\d{1,2})\s*HORAS?\b/i);
		if (mH) out.horas = parseInt(mH[1], 10);

		// "do dia 11/08 para 12/08" \u2014 vale o primeiro
		const mD = t.match(/dia\s+(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/i);
		if (mD) {
			const hoje = new Date();
			let ano = mD[3] ? parseInt(mD[3], 10) : hoje.getFullYear();
			if (ano < 100) ano += 2000;
			const p2 = n => String(n).padStart(2, '0');
			// data no futuro significa que o aviso \u00E9 do ano anterior (virada de ano)
			const d = new Date(ano, parseInt(mD[2], 10) - 1, parseInt(mD[1], 10));
			if (!mD[3] && d.getTime() - hoje.getTime() > 3 * 24 * 3600000) d.setFullYear(ano - 1);
			out.dtEvento = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
		}

		// linhas "* AVR 7C57 - S\u00E9rgio Da Rocha" (placa com ou sem h\u00EDfen/espa\u00E7o)
		t.split(/\r?\n/).forEach(linha => {
			const l = linha.replace(/^\s*[*\u2022\-\u2013]\s*/, '').trim();
			if (!l) return;
			const m = l.match(/^([A-Z]{3})\s*-?\s*([0-9][A-Z0-9][0-9]{2})\s*[-\u2013:]\s*(.+)$/i);
			if (!m) return;
			out.itens.push({
				placa: (m[1] + '-' + m[2]).toUpperCase(),
				motorista: m[3].replace(/\s+/g, ' ').trim()
			});
		});
		if (!out.horas) out.avisos.push('n\u00E3o encontrei as horas da puni\u00E7\u00E3o');
		if (!out.dtEvento) out.avisos.push('n\u00E3o encontrei a data do evento');
		if (!out.itens.length) out.avisos.push('nenhuma placa reconhecida');
		return out;
	}

	function abrirPunicoes() {
		D.getElementById('modal-punicoes')?.remove();

		const modal = D.createElement('div');
		modal.id = 'modal-punicoes';
		modal.style.cssText =
			'position:fixed;top:4%;left:50%;transform:translateX(-50%);width:1320px;max-width:97vw;' +
			'max-height:92vh;overflow:hidden;background:#fff;z-index:2147483000;' +
			'display:flex;flex-direction:column;' +
			'';
		modal.classList.add('cop-jan');
		estiloJanelas();

		modal.innerHTML = `
			<div id="pu-header" class="cop-jan-head" style="--cop-acento:#AD1457;cursor:move;display:flex;align-items:center;gap:8px;user-select:none;">
				<span style="flex:1;">\u2696 Puni\u00E7\u00F5es</span>
				<button id="pu-fechar" class="cop-jan-x">\u2716</button>
			</div>
			<div style="padding:8px 12px;border-bottom:1px solid #ddd;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;background:#fafafa;">
				<label style="display:flex;align-items:center;gap:4px;">Transportadora:
					<select id="pu-frota" style="padding:3px 6px;border:1px solid #ccc;border-radius:4px;">
						${PUNICOES_CFG.map((c, i) => `<option value="${i}">${escHtml(c.nome)}</option>`).join('')}
					</select>
				</label>
				<label style="display:flex;align-items:center;gap:4px;">Data (dia anterior):
					<input id="pu-data" type="text" value="${escAttr(dataOntemBR())}" maxlength="10" style="width:100px;padding:3px 6px;border:1px solid #ccc;border-radius:4px;">
				</label>
				<label style="display:flex;align-items:center;gap:4px;" title="Velocidade m\u00EDnima considerada no relat\u00F3rio">Acima de:
					<input id="pu-vel" type="text" value="${escAttr(PUNICOES_CFG[0].velocidade)}" maxlength="3" style="width:46px;padding:3px 6px;border:1px solid #ccc;border-radius:4px;text-align:center;"> km/h
				</label>
				<button id="pu-gerar" style="background:#AD1457;color:#fff;border:none;border-radius:6px;padding:6px 16px;font-weight:bold;cursor:pointer;">\u25B6 Gerar relat\u00F3rio</button>
				<button id="pu-aguardando" style="background:#455A64;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;">\u{1F50D} Aguardando puni\u00E7\u00E3o</button>
				<button id="pu-macro" style="background:#455A64;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;">\u{1F4EE} Falta de macro</button>
				<button id="pu-colar" style="background:#455A64;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;">\u{1F4CB} Colar da frota</button>
				<button id="pu-pdf" style="display:none;background:#455A64;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;">\u{1F5A8} Salvar PDF</button>
				<button id="pu-registrar" style="display:none;background:#AD1457;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-weight:bold;cursor:pointer;">\u2696 Registrar puni\u00E7\u00F5es</button>
			</div>
			<div id="pu-corpo" style="padding:10px 12px;overflow:auto;font-size:12px;color:#222;flex:1;">
				Escolha a transportadora e a data e clique em <b>Gerar relat\u00F3rio</b>.
				O relat\u00F3rio abre em outra aba para salvar em PDF.
				${PUNICOES_CFG.map(c => c.punir
					? `<b>${escHtml(c.nome)}</b>: pune de ${c.minPicos} a ${c.maxPicos} picos (${c.horas}h)`
					: `<b>${escHtml(c.nome)}</b>: somente relat\u00F3rio`).join(' \u00B7 ')}.
				O PDF enviado ao cliente \u00E9 o relat\u00F3rio detalhado.
			</div>`;

		D.body.appendChild(modal);
		D.getElementById('pu-fechar').onclick = () => modal.remove();

		const header = D.getElementById('pu-header');
		header.onmousedown = (e) => {
			if (e.target.closest('button')) return;
			const sx = e.clientX - modal.getBoundingClientRect().left;
			const sy = e.clientY - modal.getBoundingClientRect().top;
			const mv = ev => { modal.style.left = (ev.pageX - sx) + 'px'; modal.style.top = (ev.pageY - sy) + 'px'; modal.style.transform = 'none'; };
			const up = () => { D.removeEventListener('mousemove', mv); D.removeEventListener('mouseup', up); };
			D.addEventListener('mousemove', mv); D.addEventListener('mouseup', up);
			e.preventDefault();
		};

		let atual = null; // {cfg, dt, vel, linhas}

		// ao trocar a transportadora, sugere a velocidade configurada para ela
		D.getElementById('pu-frota').onchange = function () {
			const cfg = PUNICOES_CFG[parseInt(this.value, 10)];
			if (cfg) D.getElementById('pu-vel').value = cfg.velocidade;
		};

		D.getElementById('pu-pdf').onclick = () => { if (atual) salvarRelatorioPdf(atual.cfg, atual.dt, atual.vel); };
		D.getElementById('pu-gerar').onclick = gerar;
		D.getElementById('pu-aguardando').onclick = verAguardando;
		D.getElementById('pu-macro').onclick = verFaltaDeMacro;
		D.getElementById('pu-colar').onclick = telaColarPunicoes;

		// cola o aviso da transportadora e cadastra as puni\u00E7\u00F5es de uma vez
		function telaColarPunicoes() {
			const corpo = D.getElementById('pu-corpo');
			D.getElementById('pu-pdf').style.display = 'none';
			D.getElementById('pu-registrar').style.display = 'none';
			corpo.innerHTML =
				'<div style="margin-bottom:8px;">Cole abaixo o aviso da transportadora (dire\u00E7\u00E3o ininterrupta):</div>' +
				'<textarea id="pc-texto" rows="8" placeholder="N\u00C3O Realizou parada de pernoite do dia 11/08 para 12/08 - A puni\u00E7\u00E3o ser\u00E1 de 11 HORAS&#10;* AVR 7C57 - S\u00E9rgio Da Rocha&#10;* AVR 7C81 - Milton Cesar de Paula" ' +
				'style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:12px;font-family:inherit;resize:vertical;"></textarea>' +
				'<div style="display:flex;gap:10px;align-items:center;margin-top:8px;flex-wrap:wrap;">' +
				'<label style="display:flex;align-items:center;gap:4px;font-size:12px;">Frota:' +
				'<select id="pc-frota" style="padding:3px 6px;border:1px solid #ccc;border-radius:4px;">' +
				PUNICOES_CFG.filter(c => c.punir).map(c => `<option value="${escAttr(c.nome)}">${escHtml(c.nome)}</option>`).join('') +
				'</select></label>' +
				'<button id="pc-ler" style="background:#AD1457;color:#fff;border:none;border-radius:6px;padding:6px 16px;font-weight:bold;cursor:pointer;">\u{1F50E} Interpretar</button>' +
				'</div><div id="pc-result" style="margin-top:10px;"></div>';

			D.getElementById('pc-ler').onclick = () => {
				const res = D.getElementById('pc-result');
				const dados = interpretarPunicoesColadas(D.getElementById('pc-texto').value);
				if (dados.avisos.length && !dados.itens.length) {
					res.innerHTML = `<div style="color:#b22222;padding:8px;">N\u00E3o consegui ler: ${escHtml(dados.avisos.join('; '))}.</div>`;
					return;
				}
				const dtLimite = somarDias(dados.dtEvento, PUNICAO_PRAZO_DIAS);
				res.innerHTML =
					'<div style="background:#fff8e1;border:1px solid #e0c36b;border-radius:6px;padding:8px 10px;margin-bottom:10px;color:#7a5c00;">' +
					`Evento: <b>${escHtml(dados.dtEvento || '?')}</b> \u00B7 Puni\u00E7\u00E3o: <b>${dados.horas || '?'}h</b> \u00B7 ` +
					`Prazo para cobrar: <b>${escHtml(dtLimite || '?')}</b>` +
					(dados.avisos.length ? `<br>\u26A0 ${escHtml(dados.avisos.join('; '))}` : '') + '</div>' +
					'<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f5f5f5;text-align:left;">' +
					'<th style="padding:6px;border-bottom:1px solid #ccc;width:26px;"><input type="checkbox" id="pc-todos" checked></th>' +
					['Placa', 'Motorista', 'Situa\u00E7\u00E3o'].map(h => `<th style="padding:6px;border-bottom:1px solid #ccc;">${h}</th>`).join('') +
					'</tr></thead><tbody>' +
					dados.itens.map((it, i) =>
						`<tr data-i="${i}" style="border-bottom:1px solid #eee;">` +
						`<td style="padding:6px;"><input type="checkbox" class="pc-ck" data-i="${i}" checked></td>` +
						`<td style="padding:6px;font-weight:bold;">${escHtml(it.placa)}</td>` +
						`<td style="padding:6px;">${escHtml(it.motorista)}</td>` +
						'<td style="padding:6px;color:#555;" class="pc-st">aguardando</td></tr>').join('') +
					'</tbody></table>' +
					(dados.horas && dados.dtEvento
						? `<div style="margin-top:10px;"><button id="pc-cadastrar" style="background:#AD1457;color:#fff;border:none;border-radius:8px;padding:9px 18px;font-weight:bold;cursor:pointer;">\u2696 Cadastrar ${dados.itens.length} puni\u00E7\u00E3o(\u00F5es)</button></div>`
						: '<div style="margin-top:10px;color:#b22222;">Sem horas ou data no texto \u2014 corrija antes de cadastrar.</div>');

				const cbT = D.getElementById('pc-todos');
				if (cbT) cbT.onchange = () => res.querySelectorAll('.pc-ck').forEach(c => { c.checked = cbT.checked; });
				const bc = D.getElementById('pc-cadastrar');
				if (bc) bc.onclick = () => cadastrarPunicoesColadas(dados, dtLimite, res, bc);
			};
		}

		async function cadastrarPunicoesColadas(dados, dtLimite, res, btn) {
			const nomeFrota = D.getElementById('pc-frota').value;
			const cfg = PUNICOES_CFG.find(c => c.nome === nomeFrota);
			if (!cfg) { alert('Frota n\u00E3o encontrada.'); return; }
			const sel = Array.from(res.querySelectorAll('.pc-ck:checked')).map(c => dados.itens[parseInt(c.dataset.i, 10)]);
			if (!sel.length) { alert('Selecione ao menos uma placa.'); return; }
			if (!confirm(`Cadastrar ${sel.length} puni\u00E7\u00E3o(\u00F5es) de ${dados.horas}h para ${cfg.nome}?\n\n` +
				`Evento: ${dados.dtEvento}\nPrazo para cobrar: ${dtLimite}`)) return;

			btn.disabled = true;
			let ok = 0, erro = 0;
			try {
				const [mapaVeic, mapaMot] = await Promise.all([
					mapaOptions(URL_PUN_VEICULOS, cfg.cdClifor),
					mapaOptions(URL_PUN_MOTORIST, cfg.cdClifor)
				]);
				for (const it of sel) {
					const td = res.querySelector(`tr[data-i="${dados.itens.indexOf(it)}"] .pc-st`);
					try {
						const cdVeiculo = mapaVeic[chaveCadastro(it.placa)] || mapaVeic[chaveCadastro(it.placa.replace('-', ''))];
						const achado = acharMotoristaNoCadastro(mapaMot, it.motorista);
						const cdMotorista = achado.cd;
						if (!cdVeiculo) throw new Error('placa n\u00E3o encontrada no cadastro');
						if (!cdMotorista) throw new Error(achado.motivo || 'motorista n\u00E3o encontrado no cadastro');
						it.__nomeCadastro = achado.exato ? '' : achado.nomeCadastro;
						const sucesso = await registrarPunicao({
							cdClifor: cfg.cdClifor, cdMotorista: cdMotorista, cdVeiculo: cdVeiculo,
							dtEvento: dados.dtEvento, horas: dados.horas, dtLimite: dtLimite,
							cdTipo: PUNICAO_COLADA_TIPO
						});
						if (sucesso) {
							ok++;
							if (td) td.innerHTML = '<span style="color:#2e7d32;font-weight:bold;">\u2714 cadastrada</span>' +
								(it.__nomeCadastro ? `<span style="color:#777;font-size:11px;"> \u2014 ${escHtml(it.__nomeCadastro)}</span>` : '');
						}
						else { erro++; if (td) td.innerHTML = '<span style="color:#b26a00;">enviada sem confirma\u00E7\u00E3o</span>'; }
					} catch (e) {
						erro++;
						console.error('[PUNICAO] falha em', it.placa, e);
						if (td) td.innerHTML = `<span style="color:#b22222;">\u2716 ${escHtml(e.message || 'falhou')}</span>`;
					}
				}
				alert(`Cadastro conclu\u00EDdo.\n\nCadastradas: ${ok}` + (erro ? `\nFalhas: ${erro}` : ''));
			} catch (e) {
				console.error('[PUNICAO] erro geral:', e);
				alert('Erro ao cadastrar. Veja o console (F12).');
			} finally { btn.disabled = false; }
		}

		// ve\u00EDculos Colli/Falleiro que n\u00E3o enviaram a macro de encerramento
		async function verFaltaDeMacro() {
			const corpo = D.getElementById('pu-corpo');
			const btn = D.getElementById('pu-macro');
			D.getElementById('pu-pdf').style.display = 'none';
			D.getElementById('pu-registrar').style.display = 'none';
			btn.disabled = true;
			corpo.innerHTML = '\u23F3 Carregando as placas da base...';
			try {
				const frota = await buscarVeiculosDaBase(CD_BASE_SUPERVISAO);
				const alvos = frota.map(v => ({ v: v, cfg: cfgMacroDoCliente(v.cliente) })).filter(x => x.cfg);
				if (!alvos.length) {
					corpo.innerHTML = '<div style=\"padding:12px;color:#555;\">Nenhuma placa de ' +
						MACRO_PUNICAO.map(c => escHtml(c.nome)).join(' ou ') + ' na base.';
					return;
				}

				const linhas = [];
				for (let i = 0; i < alvos.length; i++) {
					const { v, cfg } = alvos[i];
					const jan = janelaMacroFrota(v.cliente);
					const naJanela = dentroDaJanela(jan);
					const mac = lerMacro(v.macro);
					const jm = janelaMacroValida(cfg);
					const dentroJanela = ts => ts == null || (ts >= jm.ini && ts <= jm.fim);
					let macroOk = !!(mac && cfg.macroRe.test(mac.texto) && dentroJanela(mac.ts));
					const r = { v: v, cfg: cfg, mac: mac, macroOk: macroOk, jan: jan, naJanela: naJanela,
						hist: null, area: null, viaHistorico: null, semPosicao: /PERDA\s*DE\s*POSI/i.test(v.ocorrencias || ''),
						// anota\u00E7\u00E3o de puni\u00E7\u00E3o na placa: j\u00E1 est\u00E1 punido, n\u00E3o punir de novo
						jaPunido: (motivoBloqueio(v.obs) === 'punicao' && !(v.obsTs != null && v.obsTs < inicioDeOntem()))
							? String(v.obs || '').replace(/\s+/g, ' ').trim() : '' };

					// a \u00FAltima macro pode ser outra (ex.: alimenta\u00E7\u00E3o ap\u00F3s o pernoite):
					// procura a macro de encerramento no hist\u00F3rico da janela
					if (!macroOk && naJanela && !r.semPosicao) {
						try {
							const hist = await buscarHistoricoMacros(v.cdVeiculo, 3);
							const achada = hist.find(m => cfg.macroRe.test(m.texto) && dentroJanela(m.ts));
							if (achada) { macroOk = true; r.macroOk = true; r.viaHistorico = achada; }
						} catch (e) { }
					}

					// fora da janela de pernoite n\u00E3o se pune \u2014 e nem se gasta request
					if (naJanela && !macroOk && !(isFinite(v.vel) && v.vel > 0)) {
						corpo.innerHTML = `\u23F3 Verificando ${escHtml(v.placa)} (${i + 1}/${alvos.length})...`;
						try {
							const pos = await buscarHistoricoPosicoes(v.cdVeiculo, v.cdMct, v.limitevel);
							r.hist = analisarUltimasPosicoes(pos, 3);
						} catch (e) { }
						try { r.area = areaQueContem(v.lat, v.lon, await areasLiberadas(v.cdProp)); } catch (e) { }
						// autoriza\u00E7\u00E3o que dispensa macro (N\u00E3o Usar Macro / Motorista PX)
						try {
							const auts = await autorizacoesVigentes(v.cdVeiculo);
							const disp = (auts || []).find(a => autorizDispensaMacro(a.tipo));
							if (disp) r.dispensaMacro = disp;
						} catch (e) { }
					}
					linhas.push(r);
				}

				const p2h = m => String(Math.floor(m / 60)).padStart(2, '0') + 'h' + String(m % 60).padStart(2, '0');
				const situacao = r => {
					if (!r.jan) return { punir: false, txt: 'Frota sem hor\u00E1rio de pernoite no manual', cor: '#777' };
					if (!r.naJanela) return { punir: false,
						txt: `Fora do hor\u00E1rio de pernoite (${p2h(r.jan.iniMin)}\u2013${p2h(r.jan.fimMin)})`, cor: '#777' };
					if (r.jaPunido)
						return { punir: false, cor: '#7a5c00',
							txt: `\u2696 J\u00E1 em puni\u00E7\u00E3o: ${escHtml(r.jaPunido.slice(0, 60))}` };
					if (r.dispensaMacro)
						return { punir: false, cor: '#b26a00',
							txt: `Autoriza\u00E7\u00E3o vigente: ${escHtml(r.dispensaMacro.tipo)} \u2014 n\u00E3o punir` };
					if (r.semPosicao) return { punir: false, txt: 'Perda de posi\u00E7\u00E3o \u2014 n\u00E3o punir', cor: '#b26a00' };
					// carga/descarga: pode estar no cliente mesmo fora de alvo \u2014 operador confere
					if (RE_MACRO_CLIENTE.test((r.mac && r.mac.texto) || ''))
						return { punir: false, txt: `\u26A0 Macro ${escHtml((r.mac.texto || '').slice(0, 28))} \u2014 verificar se est\u00E1 em cliente`, cor: '#b26a00' };
					if (r.macroOk) return { punir: false,
						txt: `\u2714 Macro ${escHtml(r.cfg.macroRotulo)} enviada` +
							(r.viaHistorico ? ` (${escHtml(r.viaHistorico.quando)}, no hist\u00F3rico)` : ''), cor: '#2e7d32' };
					if (isFinite(r.v.vel) && r.v.vel > 0) return { punir: false, txt: `Em movimento (${r.v.vel} km/h)`, cor: '#b26a00' };
					if (r.hist && r.hist.disponivel && !r.hist.paradas)
						return { punir: false, txt: 'Rodou nas \u00FAltimas posi\u00E7\u00F5es', cor: '#b26a00' };
					if (r.hist && r.hist.disponivel && r.hist.paradas && !r.hist.mesmoLocal)
						return { punir: false, txt: `Mudou de posi\u00E7\u00E3o (${r.hist.distMax} m) apesar de velocidade 0`, cor: '#b26a00' };
					if (r.area) return { punir: false, txt: `Em local liberado: ${escHtml(r.area.nome)}`, cor: '#b26a00' };
					return { punir: true, txt: `Sem a macro ${escHtml(r.cfg.macroRotulo)} \u2014 pass\u00EDvel de puni\u00E7\u00E3o`, cor: '#b71c1c' };
				};
				const puniveis = linhas.filter(r => situacao(r).punir);

				const janelasAbertas = MACRO_PUNICAO
					.map(c => ({ nome: c.nome, j: janelaMacroFrota(c.nome) }))
					.filter(x => x.j && dentroDaJanela(x.j));

				corpo.innerHTML =
					`<div style=\"margin-bottom:8px;\"><b>${linhas.length}</b> placa(s) de ` +
					MACRO_PUNICAO.map(c => {
						const j = janelaMacroFrota(c.nome);
						return `${escHtml(c.nome)} (${j ? p2h(j.iniMin) + '\u2013' + p2h(j.fimMin) : '?'})`;
					}).join(' / ') +
					` \u2014 <b style=\"color:#b71c1c;\">${puniveis.length}</b> sem a macro de encerramento.</div>` +
					(janelasAbertas.length ? '' :
						'<div style=\"background:#eceff1;border:1px solid #cfd8dc;border-radius:6px;padding:8px 10px;margin-bottom:10px;color:#455A64;\">' +
						'\u{1F551} Nenhuma frota est\u00E1 em hor\u00E1rio de pernoite agora. A puni\u00E7\u00E3o por falta de macro s\u00F3 vale dentro da janela ' +
						'de cada frota \u2014 fora dela o condutor j\u00E1 pode ter reiniciado a jornada.</div>') +
					'<div style=\"background:#fff8e1;border:1px solid #e0c36b;border-radius:6px;padding:8px 10px;margin-bottom:10px;color:#7a5c00;\">' +
					'\u26A0 O script apenas <b>registra a anota\u00E7\u00E3o</b> de puni\u00E7\u00E3o. O <b>bloqueio do ve\u00EDculo \u00E9 manual</b> \u2014 ' +
					'confira a placa e bloqueie pelo portal depois de anotar.</div>' +
					'<table style=\"width:100%;border-collapse:collapse;font-size:12px;\">' +
					'<thead><tr style=\"background:#f5f5f5;text-align:left;\">' +
					'<th style=\"padding:6px;border-bottom:1px solid #ccc;width:26px;\"><input type=\"checkbox\" id=\"pm-todos\" checked></th>' +
					['Placa', 'Frota', '\u00DAltima macro', 'Vel.', '3 \u00FAlt. posi\u00E7\u00F5es', 'Situa\u00E7\u00E3o'].map(h =>
						`<th style=\"padding:6px;border-bottom:1px solid #ccc;\">${h}</th>`).join('') +
					'</tr></thead><tbody>' +
					linhas.map((r, i) => {
						const sit = situacao(r);
						const h = r.hist;
						const histTxt = (h && h.disponivel)
							? (h.paradas ? (h.mesmoLocal ? '0, 0, 0 \u2014 mesmo local' : `0, 0, 0 \u2014 ${h.distMax} m`)
										 : h.ultimas.map(p => p.vel).join(', '))
							: '\u2014';
						return `<tr data-i=\"${i}\" style=\"border-bottom:1px solid #eee;${sit.punir ? 'background:#fff3f3;' : ''}\">` +
							`<td style=\"padding:6px;\">${sit.punir ? `<input type=\"checkbox\" class=\"pm-ck\" data-i=\"${i}\" checked>` : ''}</td>` +
							`<td style=\"padding:6px;font-weight:bold;\">${escHtml(r.v.placa)}</td>` +
							`<td style=\"padding:6px;\">${escHtml(r.cfg.nome)}</td>` +
							`<td style=\"padding:6px;color:#666;\" title=\"${escAttr(r.v.macro || '')}\">${escHtml(r.mac ? (r.mac.texto + (r.mac.quando ? ' \u00B7 ' + r.mac.quando : '')) : '(sem macro)').slice(0, 46)}</td>` +
							`<td style=\"padding:6px;\">${isFinite(r.v.vel) ? r.v.vel : '\u2014'}</td>` +
							`<td style=\"padding:6px;white-space:nowrap;\">${escHtml(histTxt)}</td>` +
							`<td style=\"padding:6px;color:${sit.cor};${sit.punir ? 'font-weight:bold;' : ''}\">${sit.txt}</td>` +
							'</tr>';
					}).join('') +
					'</tbody></table>' +
					(puniveis.length
						? '<div style=\"margin-top:10px;\"><button id=\"pm-anotar\" style=\"background:#AD1457;color:#fff;border:none;border-radius:8px;padding:9px 18px;font-weight:bold;cursor:pointer;\">' +
						  `\u270D Registrar anota\u00E7\u00E3o de puni\u00E7\u00E3o (${puniveis.length})</button></div>`
						: '');

				const cbT = D.getElementById('pm-todos');
				if (cbT) cbT.onchange = () => corpo.querySelectorAll('.pm-ck').forEach(c => { c.checked = cbT.checked; });

				const bAnot = D.getElementById('pm-anotar');
				if (bAnot) bAnot.onclick = async () => {
					const sel = Array.from(corpo.querySelectorAll('.pm-ck:checked')).map(c => linhas[parseInt(c.dataset.i, 10)]);
					if (!sel.length) { alert('Selecione ao menos uma placa.'); return; }
					const porFrota = {};
					sel.forEach(r => { porFrota[r.cfg.nome] = (porFrota[r.cfg.nome] || 0) + 1; });
					if (!confirm(`Registrar a anota\u00E7\u00E3o de puni\u00E7\u00E3o em ${sel.length} placa(s)?\n\n` +
						Object.keys(porFrota).map(f => `\u2022 ${f}: ${porFrota[f]}`).join('\n') +
						'\n\nO ve\u00EDculo N\u00C3O ser\u00E1 bloqueado pelo script \u2014 fa\u00E7a o bloqueio manualmente depois.')) return;

					bAnot.disabled = true;
					let ok = 0, erro = 0;
					for (const r of sel) {
						const td = corpo.querySelector(`tr[data-i=\"${linhas.indexOf(r)}\"] td:last-child`);
						try {
							const resp = await enviarComentarioVeiculo(r.cfg.anotacao, r.v.cdVeiculo);
							const deu = resp.indexOf('inserido com sucesso') !== -1;
							if (deu) ok++; else erro++;
							if (td) td.innerHTML = deu
								? '<span style=\"color:#2e7d32;font-weight:bold;\">\u2714 Anotado \u2014 bloquear manualmente</span>'
								: '<span style=\"color:#b26a00;\">\u26A0 Enviado sem confirma\u00E7\u00E3o</span>';
						} catch (e) {
							erro++;
							console.error('[MACRO] erro ao anotar', r.v.placa, e);
							if (td) td.innerHTML = '<span style=\"color:#b22222;\">\u2716 Falha ao anotar</span>';
						}
						bAnot.textContent = `\u23F3 Anotando... ${ok + erro}/${sel.length}`;
					}
					bAnot.disabled = false;
					bAnot.textContent = `\u270D Registrar anota\u00E7\u00E3o de puni\u00E7\u00E3o (${puniveis.length})`;
					alert(`Anota\u00E7\u00F5es registradas: ${ok}` + (erro ? `\nFalhas: ${erro}` : '') +
						'\n\nLembre-se: o bloqueio dos ve\u00EDculos \u00E9 MANUAL.');
				};
			} catch (e) {
				console.error('[MACRO] erro:', e);
				corpo.innerHTML = '<div style=\"padding:10px;color:#b22222;\">Erro ao verificar. Veja o console (F12).</div>';
			} finally {
				btn.disabled = false;
			}
		}

		// quem est\u00E1 aguardando puni\u00E7\u00E3o e pode ter a puni\u00E7\u00E3o iniciada agora
		async function verAguardando() {
			const corpo = D.getElementById('pu-corpo');
			const btn = D.getElementById('pu-aguardando');
			D.getElementById('pu-pdf').style.display = 'none';
			D.getElementById('pu-registrar').style.display = 'none';
			btn.disabled = true;
			corpo.innerHTML = '\u23F3 Buscando ve\u00EDculos aguardando puni\u00E7\u00E3o...';
			try {
				const [lista, frota] = await Promise.all([
					buscarAguardandoPunicao(CD_BASE_SUPERVISAO),
					buscarVeiculosDaBase(CD_BASE_SUPERVISAO)
				]);
				// aguardando + cumprindo + cumpridas (situa\u00E7\u00E3o em branco): todas precisam de a\u00E7\u00E3o
				const aguardando = lista.filter(x =>
					/aguardando|cumprindo/i.test(x.situacao) || !String(x.situacao || '').trim());
				if (!aguardando.length) {
					corpo.innerHTML = '<div style="padding:12px;color:#2e7d32;">\u2714 Nenhum ve\u00EDculo aguardando puni\u00E7\u00E3o no momento.</div>';
					return;
				}

				const porPlaca = {};
				frota.forEach(v => { porPlaca[v.placa.toUpperCase()] = v; });

				/* Uma placa pode ter v\u00E1rias puni\u00E7\u00F5es pendentes. Ordenamos da mais
				   antiga para a mais nova (prazo menor primeiro) e marcamos a
				   ordem, para o operador cumprir na sequ\u00EAncia certa.          */
				/* Ordem de cadastro: o cd_punicao \u00E9 sequencial, ent\u00E3o ordenar por
				   ele mant\u00E9m a lista na ordem em que as puni\u00E7\u00F5es entraram \u2014
				   independente da situa\u00E7\u00E3o de cada uma.                        */
				const tsPrazo = x => parseInt(x.cdPunicao, 10) || Number.MAX_SAFE_INTEGER;
				const porPlacaPun = {};
				aguardando.forEach(x => {
					const k = String(x.placa || '').toUpperCase();
					(porPlacaPun[k] = porPlacaPun[k] || []).push(x);
				});
				Object.keys(porPlacaPun).forEach(k => {
					// dentro da placa, a sequ\u00EAncia tamb\u00E9m \u00E9 a de cadastro
					const arr = porPlacaPun[k].sort((a, b) =>
						(parseInt(a.cdPunicao, 10) || 0) - (parseInt(b.cdPunicao, 10) || 0));
					arr.forEach((x, i) => { x.__ordem = i + 1; x.__total = arr.length; });
				});
				aguardando.sort((a, b) => tsPrazo(a) - tsPrazo(b));

				const linhas = [];
				for (let i = 0; i < aguardando.length; i++) {
					const p = aguardando[i];
					corpo.innerHTML = `\u23F3 Verificando ${escHtml(p.placa)} (${i + 1}/${aguardando.length})...`;
					const v = porPlaca[p.placa];
					const r = { ...p, cdVeiculo: v?.cdVeiculo || '', cdProp: v?.cdProp || '',
						posicao: v?.posicao || '', tecnologia: v?.tecnologia || '', macro: v?.macro || '',
						lat: v?.lat, lon: v?.lon,
						vel: v ? v.vel : null, area: null, autoriz: [], hist: null };
					if (v) {
						try {
							const areas = await areasLiberadas(v.cdProp);
							const dentro = areaQueContem(v.lat, v.lon, areas);
							// posto: pode punir, mas registra para o operador saber onde est\u00E1
							if (dentro && ehAreaPosto(dentro)) { r.areaPosto = dentro; r.area = null; }
							else r.area = dentro;
							if (!r.area) r.perto = areaProxima(v.lat, v.lon, areas);
						} catch (e) { }
						try { r.autoriz = await autorizacoesVigentes(v.cdVeiculo); } catch (e) { }
						try {
							const pos = await buscarHistoricoPosicoes(v.cdVeiculo, v.cdMct, v.limitevel);
							r.hist = analisarUltimasPosicoes(pos, 3);
						} catch (e) { console.warn('[PUNICOES] hist\u00F3rico indispon\u00EDvel para', p.placa, e); }
						try {
							const pontos = await buscarOrigemDestino(v.cdVeiculo, v.cdProp);
							r.pontoViagem = pontoDeViagemQueContem(v.lat, v.lon, pontos);
						} catch (e) { console.warn('[PUNICOES] origem/destino indispon\u00EDvel para', p.placa, e); }
					}
					linhas.push(r);
				}

				// impedimentos autom\u00E1ticos. A aus\u00EAncia deles N\u00C3O autoriza punir:
				// a decis\u00E3o final \u00E9 sempre do operador, conferindo a placa.
				const impedimento = r => {
					// situa\u00E7\u00E3o em branco na supervis\u00E3o = tempo de puni\u00E7\u00E3o encerrado
					if (!String(r.situacao || '').trim())
						return { pode: false, txt: '\u2714 Puni\u00E7\u00E3o finalizada \u2014 concluir para tirar da lista' };
					if (/cumprindo/i.test(r.situacao || '') || r.estado === '2') {
						const resta = String(r.prazo || '').trim();
						return { pode: false, txt: resta
							? `\u23F3 Cumprindo puni\u00E7\u00E3o \u2014 restam ${resta}`
							: '\u23F3 Cumprindo puni\u00E7\u00E3o' };
					}
					if (!r.cdVeiculo) return { pode: false, txt: 'Placa n\u00E3o encontrada no grid da base' };
					if (isFinite(r.vel) && r.vel > 0)
						return { pode: false, txt: `Ve\u00EDculo em movimento (${r.vel} km/h) \u2014 n\u00E3o punir` };
					// 3 \u00FAltimas posi\u00E7\u00F5es: confirmam (ou desmentem) o "parado" do grid
					if (r.hist && r.hist.disponivel && !r.hist.paradas) {
						const rodando = r.hist.ultimas.filter(p => p.vel > 0).map(p => p.vel + ' km/h').join(', ');
						return { pode: false, txt: `Rodou nas \u00FAltimas posi\u00E7\u00F5es (${rodando}) \u2014 n\u00E3o punir` };
					}
					// a velocidade pode estar travada em 0 (hod\u00F4metro com defeito): a coordenada denuncia
					if (r.hist && r.hist.disponivel && r.hist.paradas && !r.hist.mesmoLocal)
						return { pode: false, txt: `Mudou de posi\u00E7\u00E3o (${r.hist.distMax} m) apesar de velocidade 0 \u2014 n\u00E3o punir` };
					if (r.area) return { pode: false, txt: `Dentro de \u00E1rea liberada/alvo: ${r.area.nome}` };
					if (r.pontoViagem)
						return { pode: false, txt: `Dentro do ponto de ${r.pontoViagem.tipo.toLowerCase()} da viagem: ${r.pontoViagem.nome}` };
					if (r.autoriz.length) {
						const a = r.autoriz[0];
						return { pode: false, txt: `Autoriza\u00E7\u00E3o vigente: ${a.tipo} (at\u00E9 ${a.ate})` };
					}
					// carga/descarga: pode estar no cliente mesmo fora de alvo
					if (RE_MACRO_CLIENTE.test(r.macro || '')) {
						const m = lerMacro(r.macro);
						return { pode: true, alerta: true,
							txt: `Macro ${(m && m.texto ? m.texto : r.macro).slice(0, 30)} \u2014 verificar se est\u00E1 em cliente` };
					}
					if (r.areaPosto)
						return { pode: true, txt: `Parado no posto ${r.areaPosto.nome} \u2014 conferir antes de punir` };
					if (r.perto)
						return { pode: true, alerta: true,
							txt: `A ${r.perto.dist} m do alvo ${r.perto.area.nome} \u2014 conferir no mapa antes de punir` };
					if (r.hist && r.hist.disponivel && r.hist.mesmoLocal)
						return { pode: true, txt: 'Parado no mesmo local \u2014 conferir antes de punir' };
					if (r.hist && r.hist.disponivel)
						return { pode: true, txt: `Parado, oscilou ${r.hist.distMax} m \u2014 conferir antes` };
					return { pode: true, txt: 'Sem impedimento \u2014 conferir antes de punir' };
				};
				const podem = linhas.filter(r => impedimento(r).pode).length;

				corpo.innerHTML =
					`<div style="margin-bottom:8px;"><b>${linhas.length}</b> ve\u00EDculo(s) aguardando puni\u00E7\u00E3o \u2014 ` +
					`<b style="color:#00695C;">${podem}</b> sem impedimento autom\u00E1tico (conferir uma a uma), ` +
					`<b style="color:#b26a00;">${linhas.length - podem}</b> com impedimento.</div>` +
					'<div style="background:#fff8e1;border:1px solid #e0c36b;border-radius:6px;padding:8px 10px;margin-bottom:10px;color:#7a5c00;">' +
					'\u26A0 Esta verifica\u00E7\u00E3o \u00E9 apenas um apoio. Antes de punir, <b>confira a placa manualmente</b>: ' +
					'posi\u00E7\u00E3o, situa\u00E7\u00E3o da viagem e seguran\u00E7a do local. <b>Nunca bloqueie um ve\u00EDculo em movimento ' +
					'ou parado em local perigoso.</b></div>' +
					'<table style="width:100%;table-layout:auto;border-collapse:collapse;font-size:11.5px;">' +
					'<thead><tr style="background:#f5f5f5;text-align:left;">' +
					['Placa', 'Motorista', 'Empresa', 'Vel.', '3 \u00FAlt. posi\u00E7\u00F5es', 'Prazo', 'Verifica\u00E7\u00E3o', 'A\u00E7\u00F5es'].map(h =>
						`<th style="padding:6px;border-bottom:1px solid #ccc;">${h}</th>`).join('') +
					'</tr></thead><tbody>' +
					linhas.map((r, i) => {
						const imp = impedimento(r);
						const vel = isFinite(r.vel) ? r.vel : null;
						const cumprida = !String(r.situacao || '').trim();   // sem situa\u00E7\u00E3o = puni\u00E7\u00E3o cumprida
						const bt = (cls, cor, borda, rotulo, titulo) =>
							`<button class="${cls}" data-i="${i}" title="${escAttr(titulo)}" style="background:transparent;border:1px solid ${borda};border-radius:5px;padding:3px 6px;font-size:10.5px;cursor:pointer;color:${cor};">${rotulo}</button>`;
						const cumprindo = /cumprindo/i.test(r.situacao || '') || r.estado === '2';
						let acoes = '';
						if (cumprida) {
							acoes = bt('pu-finalizar', '#2e7d32', '#b6dbb9', '\u2714 Finalizar', 'Puni\u00E7\u00E3o cumprida: finalizar e tirar da lista');
						} else if (cumprindo) {
							// j\u00E1 est\u00E1 cumprindo: s\u00F3 cabe informar, cancelar ou concluir
							acoes = bt('pu-inform', '#00695C', '#cfd8dc', '\u{1F4CB} Informar', 'Informativo de ve\u00EDculo em puni\u00E7\u00E3o') + ' ' +
								bt('pu-cancelar', '#8a5a00', '#e6c9a0', '\u21BA Cancelar', 'Cancelar a puni\u00E7\u00E3o e cadastrar de novo para depois') + ' ' +
								bt('pu-finalizar', '#2e7d32', '#b6dbb9', '\u2714 Concluir', 'Concluir a puni\u00E7\u00E3o');
						} else if (imp.pode && r.cdVeiculo) {
							// fora do pernoite, alguns tipos n\u00E3o podem ser iniciados
							const janP = janelaMacroFrota(r.empresa) || janelaPernoiteFrota(detectarFrota(r.empresa));
							const podeAgora = dentroDaJanela(janP) || punivelForaDoPernoite(r.empresa, r.tipo);
							acoes = bt('pu-mapa', '#1565C0', '#cfd8dc', '\u{1F5FA} Mapa', 'Ver a placa no mapa') + ' ' +
								(podeAgora
									? bt('pu-iniciar', '#AD1457', '#e0a0b8', '\u2696 Punir', 'Baixar a puni\u00E7\u00E3o, bloquear com desbloqueio programado e anotar na placa')
									: `<span title="Este tipo s\u00F3 inicia dentro do hor\u00E1rio de pernoite" style="color:#8a5a00;font-size:10.5px;">\u{1F319} s\u00F3 no pernoite</span>`) + ' ' +
								bt('pu-inform', '#00695C', '#cfd8dc', '\u{1F4CB} Informar', 'Informativo de ve\u00EDculo em puni\u00E7\u00E3o') + ' ' +
								bt('pu-cancelar', '#8a5a00', '#e6c9a0', '\u21BA Cancelar', 'Cancelar a puni\u00E7\u00E3o e cadastrar de novo para depois');
						}
						let histCel = '<span style="color:#999;">\u2014</span>';
						if (r.hist && r.hist.disponivel) {
							const det = r.hist.ultimas.map(p =>
								`${p.dt.slice(11, 16)} \u2014 ${p.vel} km/h \u2014 ign. ${p.ig === 'L' ? 'ligada' : 'desligada'}`).join('\n');
							const cor = r.hist.paradas ? (r.hist.mesmoLocal ? '#2e7d32' : '#b26a00') : '#b26a00';
							const resumo = r.hist.paradas
								? (r.hist.mesmoLocal ? '0, 0, 0 \u2014 mesmo local' : `0, 0, 0 \u2014 ${r.hist.distMax} m`)
								: r.hist.ultimas.map(p => p.vel).join(', ');
							histCel = `<span style="color:${cor};" title="${escAttr(det)}">${escHtml(resumo)}</span>` +
								(r.hist.horasAtras > 1 ? `<br><span style="color:#b26a00;font-size:10px;">\u00FAltima h\u00E1 ${r.hist.horasAtras}h</span>` : '');
						}
						return `<tr style="border-bottom:1px solid #eee;${imp.pode ? '' : 'background:#fffdf3;'}">` +
							`<td style="padding:6px;font-weight:bold;white-space:nowrap;">${escHtml(r.placa)}` +
							(r.__total > 1
								? ` <span title="Esta placa tem ${r.__total} puni\u00E7\u00F5es pendentes \u2014 punir da mais antiga para a mais recente" style="background:#b71c1c;color:#fff;border-radius:9px;padding:1px 6px;font-size:10px;font-weight:bold;">${r.__ordem}\u00BA de ${r.__total}</span>`
								: '') + '</td>' +
							`<td style="padding:6px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escAttr(r.motorista)}">${escHtml(r.motorista)}</td>` +
							`<td style="padding:6px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escAttr(r.empresa)}">${escHtml(r.empresa)}</td>` +
							`<td style="padding:6px;${vel > 0 ? 'color:#b26a00;font-weight:bold;' : ''}">${vel == null ? '\u2014' : vel}</td>` +
							`<td style="padding:6px;white-space:nowrap;">${histCel}</td>` +
							`<td style="padding:6px;white-space:nowrap;">${escHtml(r.prazo)}</td>` +
							`<td style="padding:6px;max-width:230px;" title="${escAttr(imp.txt)}">${cumprida
								? '<span style="color:#2e7d32;font-weight:bold;">' + escHtml(imp.txt) + '</span>'
								: imp.pode
								? (imp.alerta
									? '<span style="color:#b26a00;font-weight:bold;">\u26A0 ' + escHtml(imp.txt) + '</span>'
									: '<span style="color:#00695C;">\u{1F50E} ' + escHtml(imp.txt) + '</span>')
								: '<span style="color:#b26a00;">\u26D4 ' + escHtml(imp.txt) + '</span>'}</td>` +
							`<td style="padding:6px;white-space:nowrap;">${acoes}</td>` +
							'</tr>';
					}).join('') +
					'</tbody></table>' +
					'<div style="margin-top:8px;color:#888;font-size:11px;">Impedimentos verificados automaticamente: ve\u00EDculo em movimento (posi\u00E7\u00E3o atual e 3 \u00FAltimas do hist\u00F3rico), ' +
					'dentro de \u00E1rea liberada/alvo, dentro do ponto de origem ou destino da viagem e autoriza\u00E7\u00E3o vigente ' +
					'(Trafegar, Descarga/Rein\u00EDcio Noturno, Rastreado por outra GR, Estado Desativado). ' +
					'\u00C1rea de posto n\u00E3o impede a puni\u00E7\u00E3o. ' +
					'\u26A0 tamb\u00E9m marca macro de carga/descarga, para conferir se o ve\u00EDculo est\u00E1 em cliente. ' +
					`\u26A0 marca ve\u00EDculo a at\u00E9 ${ALVO_PROXIMO_M / 1000} km de um alvo \u2014 o cadastro do alvo pode estar deslocado.</div>`;

				corpo.querySelectorAll('.pu-mapa').forEach(b => {
					const r = linhas[parseInt(b.dataset.i, 10)];
					b.onclick = () => abrirMapaPlaca(r.placa, r.cdVeiculo, r.cdProp, r.posicao);
				});
				corpo.querySelectorAll('.pu-iniciar').forEach(b => {
					b.onclick = () => iniciarPunicao(linhas[parseInt(b.dataset.i, 10)], b);
				});
				corpo.querySelectorAll('.pu-inform').forEach(b => {
					b.onclick = () => informativoPunicao(linhas[parseInt(b.dataset.i, 10)]);
				});
				corpo.querySelectorAll('.pu-cancelar').forEach(b => {
					b.onclick = () => cancelarPunicao(linhas[parseInt(b.dataset.i, 10)], b);
				});
				corpo.querySelectorAll('.pu-finalizar').forEach(b => {
					b.onclick = () => finalizarPunicao(linhas[parseInt(b.dataset.i, 10)], b);
				});
			} catch (e) {
				console.error('[PUNICOES] erro em aguardando puni\u00E7\u00E3o:', e);
				corpo.innerHTML = '<div style="padding:10px;color:#b22222;">Erro ao verificar. Veja o console (F12).</div>';
			} finally {
				btn.disabled = false;
			}
		}

		async function gerar() {
			const corpo = D.getElementById('pu-corpo');
			const btn = D.getElementById('pu-gerar');
			const cfg = PUNICOES_CFG[parseInt(D.getElementById('pu-frota').value, 10)];
			const dt = (D.getElementById('pu-data').value || '').trim();
			const vel = (D.getElementById('pu-vel').value || '').replace(/\D/g, '') || cfg.velocidade;
			if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dt)) { alert('Informe a data no formato DD/MM/AAAA.'); return; }

			btn.disabled = true;
			corpo.innerHTML = `\u23F3 Gerando o relat\u00F3rio da <b>${escHtml(cfg.nome)}</b> para ${escHtml(dt)} (acima de ${escHtml(vel)} km/h)...`;
			try {
				const html = await getTexto(urlRelatorioVelocidades(cfg, dt, dt, vel));
				const linhas = parseRelatorioVelocidades(html);
				atual = { cfg, dt, vel, linhas };
				D.getElementById('pu-registrar').style.display = 'none';
				D.getElementById('pu-pdf').style.display = linhas.length ? '' : 'none';
				render();
			} catch (e) {
				console.error('[PUNICOES] erro ao gerar:', e);
				corpo.innerHTML = '<div style="padding:10px;color:#b22222;">Erro ao buscar o relat\u00F3rio. Veja o console (F12).</div>';
			} finally {
				btn.disabled = false;
			}
		}

		function render() {
			const corpo = D.getElementById('pu-corpo');
			const { cfg, dt, vel, linhas } = atual;
			if (!linhas.length) {
				corpo.innerHTML = `<div style="padding:12px;color:#2e7d32;">\u2714 Nenhum excesso acima de ${escHtml(vel)} km/h para a ${escHtml(cfg.nome)} em ${escHtml(dt)}.</div>`;
				return;
			}
			const dentroDaFaixa = l => cfg.punir && l.qtd >= cfg.minPicos && l.qtd <= (cfg.maxPicos || Infinity);
			const puniveis = linhas.filter(dentroDaFaixa);
			const acimaDoTeto = cfg.punir ? linhas.filter(l => l.qtd > (cfg.maxPicos || Infinity)).length : 0;

			corpo.innerHTML =
				`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">` +
				`<span><b>${escHtml(cfg.nome)}</b> \u2014 ${escHtml(dt)} (acima de ${escHtml(vel)} km/h): ${linhas.length} condutor(es) com excesso` +
				(cfg.punir
					? `, <b style="color:#AD1457;">${puniveis.length} a punir</b> (de ${cfg.minPicos} a ${cfg.maxPicos} picos \u2014 ${cfg.horas}h)` +
					  (acimaDoTeto ? `, <b style="color:#b26a00;">${acimaDoTeto}</b> acima de ${cfg.maxPicos} desconsiderado(s)` : '') + '.</span>' +
					  `<label style="margin-left:auto;display:flex;align-items:center;gap:4px;">Prazo (dt_limite):` +
					  `<input id="pu-limite" type="text" value="${escAttr(somarDias(dt, PUNICAO_PRAZO_DIAS))}" maxlength="10" style="width:100px;padding:3px 6px;border:1px solid #ccc;border-radius:4px;"></label>`
					: `.</span><span style="margin-left:auto;background:#E8EAF6;border:1px solid #c5cae9;border-radius:12px;padding:3px 10px;color:#283593;">Somente relat\u00F3rio \u2014 esta frota n\u00E3o \u00E9 punida</span>`) +
				`</div>` +
				'<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
				'<thead><tr style="background:#f5f5f5;text-align:left;">' +
				(cfg.punir ? '<th style="padding:6px;border-bottom:1px solid #ccc;width:26px;"><input type="checkbox" id="pu-todos" checked></th>' : '') +
				'<th style="padding:6px;border-bottom:1px solid #ccc;">Motorista</th>' +
				'<th style="padding:6px;border-bottom:1px solid #ccc;">Placa</th>' +
				'<th style="padding:6px;border-bottom:1px solid #ccc;">Picos</th>' +
				(cfg.punir ? '<th style="padding:6px;border-bottom:1px solid #ccc;">Situa\u00E7\u00E3o</th>' : '') +
				'</tr></thead><tbody>' +
				linhas.map((l, i) => {
					const punir = dentroDaFaixa(l);
					const acima = cfg.punir && l.qtd > (cfg.maxPicos || Infinity);
					return `<tr data-i="${i}" style="border-bottom:1px solid #eee;${punir ? 'background:#fff5f8;' : (cfg.punir ? 'color:#888;' : '')}">` +
						(cfg.punir ? `<td style="padding:6px;">${punir ? `<input type="checkbox" class="pu-ck" data-i="${i}" checked>` : ''}</td>` : '') +
						`<td style="padding:6px;${punir ? 'font-weight:bold;' : ''}">${escHtml(l.motorista)}</td>` +
						`<td style="padding:6px;">${escHtml(l.placa)}</td>` +
						`<td style="padding:6px;">${l.qtd}</td>` +
						(cfg.punir
							? `<td style="padding:6px;" class="pu-st">${punir
								? `<span style="color:#AD1457;font-weight:bold;">\u2696 Punir \u2014 ${cfg.horas}h</span>`
								: (acima
									? `<span style="color:#b26a00;">acima de ${cfg.maxPicos} picos \u2014 desconsiderado</span>`
									: '<span>abaixo do limiar</span>')}</td>`
							: '') +
						'</tr>';
				}).join('') +
				'</tbody></table>' +
				(puniveis.length
					? '<div style="margin-top:8px;color:#888;font-size:11px;">O bot\u00E3o <b>Registrar puni\u00E7\u00F5es</b> fica no topo da janela. ' +
					  'O cadastro usa a data do relat\u00F3rio como evento e o prazo acima como limite.</div>'
					: '');

			const cbTodos = D.getElementById('pu-todos');
			if (cbTodos) cbTodos.onchange = () => {
				corpo.querySelectorAll('.pu-ck').forEach(cb => { cb.checked = cbTodos.checked; });
			};
			const btnReg = D.getElementById('pu-registrar');
			if (btnReg) {
				btnReg.style.display = puniveis.length ? '' : 'none';
				btnReg.textContent = `\u2696 Registrar puni\u00E7\u00F5es (${puniveis.length})`;
				btnReg.onclick = registrar;
			}
		}

		async function registrar() {
			const corpo = D.getElementById('pu-corpo');
			const btn = D.getElementById('pu-registrar');
			const { cfg, dt, linhas } = atual;
			if (!cfg.punir) { alert('A ' + cfg.nome + ' n\u00E3o \u00E9 punida \u2014 apenas relat\u00F3rio.'); return; }
			const dtLimite = (D.getElementById('pu-limite').value || '').trim();
			if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dtLimite)) { alert('Prazo inv\u00E1lido. Use DD/MM/AAAA.'); return; }

			const sel = Array.from(corpo.querySelectorAll('.pu-ck:checked')).map(cb => linhas[parseInt(cb.dataset.i, 10)]);
			if (!sel.length) { alert('Selecione ao menos um condutor.'); return; }
			if (!confirm(`Registrar ${sel.length} puni\u00E7\u00E3o(\u00F5es) de ${cfg.horas}h na ${cfg.nome}?\n\n` +
				`Evento: ${dt}\nPrazo: ${dtLimite}`)) return;

			btn.disabled = true; btn.textContent = '\u23F3 Registrando...';
			try {
				const [mapaVeic, mapaMot] = await Promise.all([
					mapaOptions(URL_PUN_VEICULOS, cfg.cdClifor),
					mapaOptions(URL_PUN_MOTORIST, cfg.cdClifor)
				]);

				for (const l of sel) {
					const tr = corpo.querySelector(`tr[data-i="${linhas.indexOf(l)}"] .pu-st`);
					const cdVeiculo   = mapaVeic[chaveCadastro(l.placa)];
					const cdMotorista = mapaMot[chaveCadastro(l.motorista)];
					if (!cdVeiculo || !cdMotorista) {
						const falta = !cdVeiculo ? 'placa' : 'motorista';
						if (tr) tr.innerHTML = `<span style="color:#b22222;">\u2716 ${falta} n\u00E3o encontrado no cadastro</span>`;
						console.warn('[PUNICOES] sem c\u00F3digo para', l.placa, l.motorista, { cdVeiculo, cdMotorista });
						continue;
					}
					try {
						const ok = await registrarPunicao({
							cdClifor: cfg.cdClifor, cdMotorista, cdVeiculo,
							dtEvento: dt, horas: cfg.horas, dtLimite
						});
						if (tr) tr.innerHTML = ok
							? `<span style="color:#2e7d32;font-weight:bold;">\u2714 Punido ${cfg.horas}h (at\u00E9 ${escHtml(dtLimite)})</span>`
							: '<span style="color:#b26a00;">\u26A0 Enviado, sem confirma\u00E7\u00E3o \u2014 conferir no sistema</span>';
					} catch (e) {
						console.error('[PUNICOES] erro ao punir', l.placa, e);
						if (tr) tr.innerHTML = '<span style="color:#b22222;">\u2716 Erro ao registrar</span>';
					}
				}
			} catch (e) {
				console.error('[PUNICOES] erro geral:', e);
				alert('Erro ao registrar as puni\u00E7\u00F5es. Veja o console (F12).');
			} finally {
				btn.disabled = false; btn.textContent = `\u2696 Registrar puni\u00E7\u00F5es (${sel.length})`;
			}
		}
	}

	/* =========================================================
	   3i. DESBLOQUEIO EM MASSA (grid + cmd/acao.php)
	   ========================================================= */
	// todas as placas de uma base, com a observa\u00E7\u00E3o completa (title da coluna Obs)
	const esperar = ms => new Promise(r => setTimeout(r, ms));

	function desbloqueioLiberado() {
		if (usuarioSemRestricao()) return true;   // operador liberado a qualquer hora
		return emJanela(DESBLOQ_JANELA.ini, DESBLOQ_JANELA.fim);
	}
	function textoJanelaDesbloqueio() {
		const p2 = n => String(n).padStart(2, '0');
		return `${p2(DESBLOQ_JANELA.ini)}:00 \u00E0s ${p2(DESBLOQ_JANELA.fim)}:00`;
	}

	async function buscarVeiculosDaBase(cdBase) {
		const url = `${URL_GRID_BASE}?Delay=&tp=&colunas=${DESBLOQ_COLUNAS}&ordenar=&ordem=&PlacaSel=&equip=&Placa=` +
			'&MCT=&BKP=&Frota=&SemPos=&Parado=&VeloD=&VeloA=&VeloIgual=&cd_grupo=&cd_tecnologiaa=&cd_proprietario=' +
			'&Ale=&evt=&tp_de=&tp_ate=&cd_vinculo=&cksi1=0&cksi2=0&cksi3=0&cksi4=0&cksi5=0&cksi6=0&cksi7=0&cksi8=0' +
			`&cksi9=0&cksi10=0&cksi11=0&cksi12=0&cksi13=0&juntar_situacoes=0&cd_base=${encodeURIComponent(cdBase)}` +
			'&idcard=&cd_filtro_salvo=';
		return parseGridVeiculos(await getTexto(url));
	}

	function parseGridVeiculos(html) {
		const veiculos = [];
		const vistos = {};
		try {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			doc.querySelectorAll('tr').forEach(tr => {
				const on = tr.getAttribute('onclick') || tr.getAttribute('onmousedown') || '';
				const m = on.match(/clica\(this,\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)'/i);
				if (!m) return;
				const cdVeiculo = m[3];
				if (!cdVeiculo || vistos[cdVeiculo]) return;
				vistos[cdVeiculo] = true;

				const td = id => tr.querySelector(`td[data-id="${id}"]`);
				const tdObs = td('obs');
				const obs = ((tdObs && (tdObs.getAttribute('title') || tdObs.textContent)) || '')
					.replace(/\s+/g, ' ').trim();

				// buscar_descricao_posicao(cd_veiculo, lat, lon, cd_clifor)
				const mPos = (tr.innerHTML || '')
					.match(/buscar_descricao_posicao\(\s*\d+\s*,\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/i);

				veiculos.push({
					placa:      m[2],
					cdVeiculo:  cdVeiculo,
					cdMct:      m[1] || '',
					limitevel:  m[8] || '',
					frota:      m[6] || '',
					cdProp:     m[7] || '',
					cliente:    (td('cliente')?.textContent || '').replace(/\s+/g, ' ').trim(),
					tecnologia: (td('rastreador')?.textContent || '').replace(/\s+/g, ' ').trim(),
					lat:        mPos ? parseFloat(mPos[1]) : null,
					lon:        mPos ? parseFloat(mPos[2]) : null,
					vel:        parseInt(((td('vel')?.textContent) || '').replace(/\D/g, ''), 10),
					macro:      (td('macro')?.textContent || '').replace(/\s+/g, ' ').trim(),
					posicao:    (td('localizacao')?.textContent || '').replace(/\s+/g, ' ')
					              .replace(/javascript:\s*buscar_descricao_posicao\([^)]*\)/i, '').trim(),
					ocorrencias:(td('ocorrencias')?.textContent || '').replace(/\s+/g, ' ').trim(),
					obs:        obs,
					obsTs:      tsDaObs(obs)
				});
			});
		} catch (e) { console.error('[DESBLOQ] falha ao ler o grid:', e); }
		return veiculos;
	}

	// "TEXTO - DD/MM/YYYY HH:MM" -> timestamp da anota\u00E7\u00E3o (ou null)
	function tsDaObs(obs) {
		const m = String(obs || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})\s*$/);
		return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime() : null;
	}

	// observa\u00E7\u00E3o menciona puni\u00E7\u00E3o? Casa PUNI\u00C7\u00C3O / PUNICAO / PUNIDO / PUNIR e
	// tamb\u00E9m texto mal decodificado ("PUNI\u00C3\u2021\u00C3\u0192O"), pois o radical PUNI basta.
	// motivo para NAO desbloquear a placa, lido da observa\u00E7\u00E3o:
	//  'punicao'          -> menciona puni\u00E7\u00E3o (radical PUNI, imune a acento/mojibake)
	//  'nao-desbloquear'  -> instru\u00E7\u00E3o direta do operador (ex.: Fribon anota assim)
	function motivoBloqueio(obs) {
		const t = String(obs || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
		if (/PUNI/.test(t)) return 'punicao';
		if (/N[AO]O\s*[-\s]*DESBLOQUEAR/.test(t)) return 'nao-desbloquear';
		return null;
	}
	function obsTemPunicao(obs) { return !!motivoBloqueio(obs); }

	/* ===== VALIDADE DA PUNI\u00C7\u00C3O =====
	   A hora de t\u00E9rmino vem, nesta ordem: do pr\u00F3prio texto da observa\u00E7\u00E3o
	   ("n\u00E3o desbloquear antes das 09hrs", "at\u00E9 as 10") ou da tabela da frota
	   (Falleiro 10h, Colli 9h, Rossini 9h). Passou da hora, a puni\u00E7\u00E3o expirou. */
	function horaFimPunicao(obs, cliente) {
		const txt = String(obs || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
		const m = txt.match(/(?:ANTES\s+D[AO]S?|AT[EO]\s*[AS]{0,2}|LIBERAR\s+[AS]{0,2})\s*(\d{1,2})\s*(?::(\d{2}))?\s*(?:H|HS|HRS|HORAS)?/);
		if (m) {
			const h = +m[1], min = +(m[2] || 0);
			if (h >= 0 && h <= 23) return { hora: h, min: min, fonte: 'observa\u00E7\u00E3o' };
		}
		const f = detectarFrota(cliente);
		if (f && f.punicaoAte != null) return { hora: f.punicaoAte, min: 0, fonte: f.nome };
		return null;
	}

	// instante em que a puni\u00E7\u00E3o termina: 1\u00AA ocorr\u00EAncia da hora ap\u00F3s a anota\u00E7\u00E3o
	function fimDaPunicao(obs, obsTs, cliente) {
		const h = horaFimPunicao(obs, cliente);
		if (!h) return null;
		const base = new Date(obsTs || Date.now());
		const fim = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h.hora, h.min, 0);
		if (fim.getTime() <= (obsTs || 0)) fim.setDate(fim.getDate() + 1); // virou o dia
		return { ts: fim.getTime(), hora: h.hora, min: h.min, fonte: h.fonte };
	}

	// in\u00EDcio do dia anterior: obs de ontem/hoje contam como puni\u00E7\u00E3o vigente
	function inicioDeOntem() {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d.getTime() - 24 * 60 * 60 * 1000;
	}

	async function enviarDesbloqueio(cliente, itens, modo) {
		// veiculos=ID1,%20ID2 (v\u00EDrgula literal, como o portal envia)
		const ids  = itens.map(v => v.cdVeiculo).join(',%20');
		const desc = itens.map((v, i) => `${i + 1} - ${v.placa} (${v.tecnologia || ''})`).join(', ');
		const cmd = comandoDaTecnologia(itens[0] && itens[0].tecnologia, modo);
		if (!cmd) throw new Error('tecnologia sem comando cadastrado: ' + (itens[0] && itens[0].tecnologia));
		const filtro = `Comando: ${cmd.label} | Propriet\u00E1rio: ${cliente}`;
		const url = `${URL_CMD_ACAO}?tp=E&veiculos=${ids}&cd_comando=${cmd.cd}` +
			`&filtro=${encodeURIComponent(filtro)}&ds_veiculos=${encodeURIComponent(desc)}`;
		const txt = await getTexto(url);
		if (/Envio Realizado com sucesso/i.test(txt)) return true;
		// alguns comandos respondem sem a mensagem padr\u00E3o: registra para conferir
		console.warn('[CMD] resposta sem a confirma\u00E7\u00E3o padr\u00E3o:', String(txt).slice(0, 180));
		return false;
	}

	/* Solicitar posi\u00E7\u00E3o direto: age nas placas vis\u00EDveis no grid, sem janela.
	   S\u00F3 consulta \u2014 n\u00E3o altera estado, por isso n\u00E3o tem trava de hor\u00E1rio nem
	   de puni\u00E7\u00E3o. Para filtrar por transportadora, use Reset e desbloqueio.    */
	// s\u00F3 estas ocorr\u00EAncias justificam pedir posi\u00E7\u00E3o
	const RE_OCORRENCIA_POSICAO = /POSICAO\s+EM\s+ATRASO|(DES)?BLOQUEAR\s+PERNOITE/;
	const pedePosicao = oc => RE_OCORRENCIA_POSICAO.test(
		String(oc || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase());

	async function solicitarPosicaoDireto() {
		console.log('[POSICAO] iniciando (v' + CENTRAL_VERSAO + ')');
		let todas = [];
		try { todas = veiculosVisiveisNoGrid(); }
		catch (e) { console.error('[POSICAO] erro ao ler o grid:', e); }
		if (!todas.length) {
			alert('N\u00E3o consegui ler nenhuma placa do grid.\n\n' +
				'Verifique se o Grid Padr\u00E3o est\u00E1 aberto com as placas listadas. ' +
				'Se estiver, abra o F12 \u203A Console e me envie o que aparece ap\u00F3s "[POSICAO]".');
			return;
		}
		// filtra: posi\u00E7\u00E3o em atraso, bloquear pernoite ou desbloquear pernoite
		const visiveis = todas.filter(v => pedePosicao(v.ocorrencias));
		console.log('[POSICAO] placas no grid:', todas.length, '| com ocorr\u00EAncia que pede posi\u00E7\u00E3o:',
			visiveis.length, visiveis.slice(0, 5).map(v => v.placa));
		if (!visiveis.length) {
			alert(`Nenhuma das ${todas.length} placas do grid tem ocorr\u00EAncia de\n` +
				'Posi\u00E7\u00E3o em Atraso, Bloquear Pernoite ou Desbloquear Pernoite.\n\n' +
				'O comando s\u00F3 \u00E9 enviado para essas ocorr\u00EAncias.');
			return;
		}

		// agrupa por transportadora + tecnologia (o r\u00F3tulo do comando depende das duas)
		const grupos = {};
		visiveis.forEach(v => {
			const chave = (v.cliente || '\u2014') + '\u241F' + (v.tecnologia || '');
			(grupos[chave] = grupos[chave] || []).push(v);
		});
		const porTec = {};
		visiveis.forEach(v => {
			const t = (v.tecnologia || '(sem tecnologia)').toUpperCase();
			porTec[t] = (porTec[t] || 0) + 1;
		});

		if (!confirm(`Solicitar posi\u00E7\u00E3o de ${visiveis.length} placa(s) do grid?\n\n` +
			Object.keys(porTec).sort().map(t => {
				const c = comandoDaTecnologia(t, 'posicao');
				return `\u2022 ${t} (${porTec[t]}): ${c ? c.label : '\u2014'}`;
			}).join('\n') +
			`\n\nS\u00F3 entram placas com Posi\u00E7\u00E3o em Atraso, Bloquear ou Desbloquear Pernoite ` +
			`(${visiveis.length} de ${todas.length} no grid).` +
			'\nO comando apenas consulta a posi\u00E7\u00E3o, n\u00E3o altera nada no ve\u00EDculo.' +
			'\nCada placa receber\u00E1 a anota\u00E7\u00E3o "ENVIADO COMANDO PARA FOR\u00C7AR A POSI\u00C7\u00C3O".')) return;

		const item = D.querySelector(`#${ID_CONSOLE_PAINEL} .cop-item[data-id="cop-posicao"] .cop-txt`);
		const rotulo = item ? item.textContent : '';
		let ok = 0, falhas = 0, feitos = 0;
		try {
			for (const chave of Object.keys(grupos)) {
				const itens = grupos[chave];
				const cliente = chave.split('\u241F')[0];
				for (let i = 0; i < itens.length; i += DESBLOQ_LOTE) {
					const lote = itens.slice(i, i + DESBLOQ_LOTE);
					try {
						const enviou = await enviarDesbloqueio(cliente, lote, 'posicao');
						console.log('[POSICAO] lote', cliente, lote.length, 'placa(s) \u2192', enviou ? 'ok' : 'sem confirma\u00E7\u00E3o');
						if (enviou) {
							ok += lote.length;
							// registra na placa que o comando foi disparado
							for (const v of lote) {
								try { await enviarComentarioVeiculo('ENVIADO COMANDO PARA FOR\u00C7AR A POSI\u00C7\u00C3O', v.cdVeiculo); }
								catch (eAnot) { console.warn('[POSICAO] falha ao anotar', v.placa, eAnot && eAnot.message); }
							}
						} else falhas += lote.length;
					} catch (e) {
						falhas += lote.length;
						console.error('[POSICAO] falha no lote', chave, e);
					}
					feitos += lote.length;
					if (item) item.textContent = `Solicitando... ${feitos}/${visiveis.length}`;
					if (feitos < visiveis.length) await esperar(DESBLOQ_PAUSA_MS);
				}
			}
		} finally {
			if (item) item.textContent = rotulo;
		}
		alert(`Solicita\u00E7\u00E3o de posi\u00E7\u00E3o conclu\u00EDda.\n\nEnviadas: ${ok}` +
			(falhas ? `\nFalhas: ${falhas}` : '') +
			'\n\nAs posi\u00E7\u00F5es chegam conforme cada rastreador responder.');
	}

	function abrirDesbloqueioMassa(modoInicial) {
		// a janela abre sempre; s\u00F3 o ENVIO do reset/desbloqueio respeita o hor\u00E1rio
		D.getElementById('modal-desbloqueio')?.remove();

		const modal = D.createElement('div');
		modal.id = 'modal-desbloqueio';
		modal.style.cssText =
			'position:fixed;top:4%;left:50%;transform:translateX(-50%);width:1040px;max-width:97vw;' +
			'max-height:92vh;overflow:hidden;background:#fff;z-index:2147483000;' +
			'display:flex;flex-direction:column;' +
			'';
		modal.classList.add('cop-jan');
		estiloJanelas();

		modal.innerHTML = `
			<div id="db-header" class="cop-jan-head" style="--cop-acento:#1565C0;cursor:move;display:flex;align-items:center;gap:8px;user-select:none;">
				<span style="flex:1;">\u{1F513} Reset de alarmes e desbloqueio em massa</span>
				<button id="db-fechar" class="cop-jan-x">\u2716</button>
			</div>
			<div style="padding:8px 12px;border-bottom:1px solid #ddd;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;background:#fafafa;">
				<label style="display:flex;align-items:center;gap:4px;">Base:
					<select id="db-base" style="padding:3px 6px;border:1px solid #ccc;border-radius:4px;">
						<option value="34" selected>Base 2</option>
						<option value="33">Base 1</option>
						<option value="26">Base Gral</option>
					</select>
				</label>
				<button id="db-carregar" style="background:#1565C0;color:#fff;border:none;border-radius:6px;padding:6px 16px;font-weight:bold;cursor:pointer;">\u21BB Carregar placas</button>
				<span style="border-left:1px solid #ddd;padding-left:10px;margin-left:4px;">
				<input id="db-avulsa" type="text" placeholder="placa fora do grid" maxlength="8" style="width:120px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;text-transform:uppercase;">
				<button id="db-buscar-avulsa" title="Buscar a placa no cadastro e enviar o comando" style="background:#455A64;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;">\u{1F50E} Buscar</button></span>
				<label style="display:flex;align-items:center;gap:4px;">Transportadora:
					<select id="db-frota" disabled style="padding:3px 6px;border:1px solid #ccc;border-radius:4px;min-width:220px;">
						<option value="">\u2014 carregue as placas \u2014</option>
					</select>
				</label>
				<input id="db-filtro" type="text" placeholder="filtrar placa..." disabled style="padding:3px 8px;border:1px solid #ccc;border-radius:4px;width:130px;">
				<button id="db-enviar" disabled style="background:#2E7D32;color:#fff;border:none;border-radius:6px;padding:6px 16px;font-weight:bold;cursor:pointer;margin-left:auto;opacity:.5;">\u{1F513} Enviar comando</button>
			</div>
			<div id="db-corpo" style="padding:10px 12px;overflow:auto;font-size:12px;color:#222;flex:1;">
				<span id="db-aviso-janela" style="border-radius:10px;padding:2px 8px;${desbloqueioLiberado() ? 'background:#E8F5E9;border:1px solid #b6dbb9;color:#256029' : 'background:#FFF3E0;border:1px solid #e6c9a0;color:#8a5a00'}">${usuarioSemRestricao()
					? 'Envio liberado a qualquer hor\u00E1rio para este operador'
					: `Dispon\u00EDvel apenas das ${textoJanelaDesbloqueio()}${desbloqueioLiberado() ? ' \u2014 liberado agora' : ' \u2014 fora do hor\u00E1rio'}`}</span><br>
				Clique em <b>Carregar placas</b> para trazer os ve\u00EDculos da base.
				O comando enviado depende da tecnologia:
				${Object.keys(CMD_MASSA.desbloq.porTecnologia).map(t =>
					`<b>${t}</b> \u2192 ${escHtml(CMD_MASSA.desbloq.porTecnologia[t].label)}`).join(' \u00B7 ')}.
				Placas com observa\u00E7\u00E3o de <b>PUNI\u00C7\u00C3O</b> ou <b>N\u00C3O DESBLOQUEAR</b> de hoje ou de ontem ficam bloqueadas e n\u00E3o recebem o comando.
			</div>`;

		D.body.appendChild(modal);
		D.getElementById('db-fechar').onclick = () => modal.remove();

		const header = D.getElementById('db-header');
		header.onmousedown = (e) => {
			if (e.target.closest('button')) return;
			const sx = e.clientX - modal.getBoundingClientRect().left;
			const sy = e.clientY - modal.getBoundingClientRect().top;
			const mv = ev => { modal.style.left = (ev.pageX - sx) + 'px'; modal.style.top = (ev.pageY - sy) + 'px'; modal.style.transform = 'none'; };
			const up = () => { D.removeEventListener('mousemove', mv); D.removeEventListener('mouseup', up); };
			D.addEventListener('mousemove', mv); D.addEventListener('mouseup', up);
			e.preventDefault();
		};

		const modoAtual = () => 'desbloq';   // esta janela faz apenas o reset/desbloqueio
		const cmdRestrito = () => !!(CMD_MASSA[modoAtual()] || {}).restrito;

		let todos = [];   // todas as placas da base
		let visiveis = []; // ap\u00F3s filtros

		// bot\u00E3o reflete a janela de hor\u00E1rio
		(function ajustarBotao() {
			const fora = !desbloqueioLiberado();
			const be = D.getElementById('db-enviar');
			be.textContent = fora ? '\u{1F512} Fora do hor\u00E1rio (' + textoJanelaDesbloqueio() + ')' : '\u{1F513} Enviar comando';
			be.title = fora ? 'Reset e desbloqueio s\u00F3 das ' + textoJanelaDesbloqueio() : '';
		})();
		D.getElementById('db-carregar').onclick = carregar;

		// placa fora do grid: busca no cadastro e envia o comando direto
		D.getElementById('db-buscar-avulsa').onclick = async () => {
			const campo = D.getElementById('db-avulsa');
			const btnB = D.getElementById('db-buscar-avulsa');
			const bruto = (campo.value || '').toUpperCase().replace(/\s/g, '');
			const m = bruto.match(/([A-Z]{3})-?([0-9][A-Z0-9][0-9]{2})/);
			if (!m) { alert('Informe a placa no formato ABC-1D23.'); return; }
			const placa = m[1] + '-' + m[2];
			const original = btnB.textContent;
			btnB.disabled = true; btnB.textContent = '\u23F3';
			try {
				const d = await buscarPlacaNoCadastro(placa);
				if (!d || !d.cdVeiculo) { alert(`${placa} n\u00E3o foi encontrada no cadastro de ve\u00EDculos.`); return; }
				const cmd = comandoDaTecnologia(d.tecnologia, modoAtual());
				if (!cmd) {
					alert(`${placa} \u2014 sem comando de ${CMD_MASSA[modoAtual()].nome} para ${d.tecnologia || 'esta tecnologia'}.`);
					return;
				}
				if (cmdRestrito() && !desbloqueioLiberado()) {
					alert('Reset e desbloqueio dispon\u00EDvel apenas das ' + textoJanelaDesbloqueio() + '.');
					return;
				}
				if (!confirm(`${placa} (${d.tecnologia || '?'}) \u2014 ${d.cliente || ''}\n\n` +
					`Enviar o comando:\n${cmd.label}?`)) return;
				const enviou = await enviarDesbloqueio(d.cliente || '', [{
					placa: placa, cdVeiculo: d.cdVeiculo, tecnologia: d.tecnologia, cliente: d.cliente
				}], modoAtual());
				alert(enviou
					? `\u2714 Comando enviado para ${placa}.\n\n${cmd.label}`
					: `Comando enviado para ${placa}, mas o portal n\u00E3o confirmou.\nConfira no hist\u00F3rico de comandos.`);
				campo.value = '';
			} catch (e) {
				console.error('[COMANDO] falha na placa avulsa:', e);
				alert('Erro ao buscar ou enviar: ' + (e && e.message ? e.message : 'ver console (F12)'));
			} finally {
				btnB.disabled = false; btnB.textContent = original;
			}
		};
		D.getElementById('db-avulsa').onkeydown = ev => {
			if (ev.key === 'Enter') { ev.preventDefault(); D.getElementById('db-buscar-avulsa').click(); }
		};
		D.getElementById('db-frota').onchange = render;
		D.getElementById('db-filtro').oninput = render;
		D.getElementById('db-enviar').onclick = enviar;

		async function carregar() {
			const corpo = D.getElementById('db-corpo');
			const btn = D.getElementById('db-carregar');
			btn.disabled = true;
			corpo.innerHTML = '\u23F3 Carregando as placas da base...';
			try {
				todos = await buscarVeiculosDaBase(D.getElementById('db-base').value);
				if (!todos.length) {
					corpo.innerHTML = '<div style="padding:10px;color:#b26a00;">Nenhuma placa retornada. A base pode estar vazia ou o grid mudou de formato.</div>';
					return;
				}
				const clientes = Array.from(new Set(todos.map(v => v.cliente).filter(Boolean))).sort();
				const sel = D.getElementById('db-frota');
				sel.innerHTML = `<option value="">Todas (${todos.length} placas)</option>` +
					clientes.map(c => {
						const n = todos.filter(v => v.cliente === c).length;
						return `<option value="${escAttr(c)}">${escHtml(c)} (${n})</option>`;
					}).join('');
				sel.disabled = false;
				D.getElementById('db-filtro').disabled = false;
				render();
			} catch (e) {
				console.error('[DESBLOQ] erro ao carregar:', e);
				corpo.innerHTML = '<div style="padding:10px;color:#b22222;">Erro ao carregar as placas. Veja o console (F12).</div>';
			} finally {
				btn.disabled = false;
			}
		}

		function classificar(v) {
			if (!cmdRestrito()) return 'ok';   // consulta de posi\u00E7\u00E3o: sem trava de puni\u00E7\u00E3o
			v.__motivo = motivoBloqueio(v.obs);
			v.__fim = null;
			if (!v.__motivo) return 'ok';

			// anota\u00E7\u00E3o de antes de ontem N\u00C3O \u00E9 puni\u00E7\u00E3o atual: a placa entra
			// como qualquer outra, sem r\u00F3tulo. (Sem data na obs, mant\u00E9m bloqueada.)
			if (v.obsTs != null && v.obsTs < inicioDeOntem()) return 'ok';

			v.__fim = fimDaPunicao(v.obs, v.obsTs, v.cliente);
			if (v.__fim && Date.now() >= v.__fim.ts) return 'expirada'; // passou da hora: liberado
			return 'punida';
		}

		function render() {
			const corpo = D.getElementById('db-corpo');
			const cliente = D.getElementById('db-frota').value;
			const filtro = (D.getElementById('db-filtro').value || '').trim().toUpperCase();

			visiveis = todos.filter(v =>
				(!cliente || v.cliente === cliente) &&
				(!filtro || v.placa.toUpperCase().indexOf(filtro) !== -1));

			const punidas = visiveis.filter(v => classificar(v) === 'punida');
			const expiradas = visiveis.filter(v => classificar(v) === 'expirada');
			const liberadas = visiveis.length - punidas.length - expiradas.length;

			corpo.innerHTML =
				'<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">' +
				`<span><b>${visiveis.length}</b> placa(s)${cliente ? ' de <b>' + escHtml(cliente) + '</b>' : ''}: ` +
				`<b style="color:#2E7D32;">${liberadas}</b> liberadas, ` +
				`<b style="color:#b71c1c;">${punidas.length}</b> em puni\u00E7\u00E3o` +
				(expiradas.length ? `, <b style="color:#2E7D32;">${expiradas.length}</b> com puni\u00E7\u00E3o expirada hoje` : '') + '</span>' +
				'</div>' +
				'<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
				'<thead><tr style="background:#f5f5f5;text-align:left;">' +
				'<th style="padding:6px;border-bottom:1px solid #ccc;width:26px;"><input type="checkbox" id="db-todos" checked></th>' +
				'<th style="padding:6px;border-bottom:1px solid #ccc;">Placa</th>' +
				'<th style="padding:6px;border-bottom:1px solid #ccc;">Frota</th>' +
				'<th style="padding:6px;border-bottom:1px solid #ccc;">Transportadora</th>' +
				'<th style="padding:6px;border-bottom:1px solid #ccc;">Tec.</th>' +
				'<th style="padding:6px;border-bottom:1px solid #ccc;">Observa\u00E7\u00E3o</th>' +
				'<th style="padding:6px;border-bottom:1px solid #ccc;" class="db-res">Situa\u00E7\u00E3o</th>' +
				'</tr></thead><tbody>' +
				visiveis.map((v, i) => {
					const st = classificar(v);
					const p2 = n => String(n).padStart(2, '0');
					const fim = v.__fim;
					const fundo = st === 'punida' ? 'background:#fff3f3;' : '';
					const rotuloMotivo = v.__motivo === 'nao-desbloquear'
						? 'Anota\u00E7\u00E3o: n\u00E3o desbloquear' : 'Em puni\u00E7\u00E3o';
					const sit = st === 'punida'
						? `<span style="color:#b71c1c;font-weight:bold;">\u{1F512} ${rotuloMotivo}${fim ? ' at\u00E9 ' + p2(fim.hora) + ':' + p2(fim.min) : ''}</span>`
						: (st === 'expirada'
							? `<span style="color:#2E7D32;">\u{1F55A} Expirou \u00E0s ${p2(fim.hora)}:${p2(fim.min)} (${escHtml(fim.fonte)})</span>`
							: '<span style="color:#555;">aguardando</span>');
					return `<tr data-i="${i}" style="border-bottom:1px solid #eee;${fundo}">` +
						`<td style="padding:6px;">${st === 'punida' ? '' : `<input type="checkbox" class="db-ck" data-i="${i}"${st === 'ok' || st === 'expirada' ? ' checked' : ''}>`}</td>` +
						`<td style="padding:6px;font-weight:bold;">${escHtml(v.placa)}</td>` +
						`<td style="padding:6px;">${escHtml(v.frota || '\u2014')}</td>` +
						`<td style="padding:6px;">${escHtml(v.cliente || '\u2014')}</td>` +
						`<td style="padding:6px;">${escHtml(v.tecnologia || '\u2014')}</td>` +
						`<td style="padding:6px;color:#666;max-width:340px;" title="${escAttr(v.obs)}">${escHtml(v.obs.slice(0, 70))}${v.obs.length > 70 ? '\u2026' : ''}</td>` +
						`<td style="padding:6px;" class="db-st">${sit}</td>` +
						'</tr>';
				}).join('') +
				'</tbody></table>';

			const cbTodos = D.getElementById('db-todos');
			if (cbTodos) cbTodos.onchange = () => {
				corpo.querySelectorAll('.db-ck').forEach(cb => { cb.checked = cbTodos.checked; });
			};
			const btnEnv = D.getElementById('db-enviar');
			btnEnv.disabled = !visiveis.length;
			btnEnv.style.opacity = visiveis.length ? '1' : '.5';
		}

		async function enviar() {
			const corpo = D.getElementById('db-corpo');
			const btn = D.getElementById('db-enviar');
			const sel = Array.from(corpo.querySelectorAll('.db-ck:checked'))
				.map(cb => visiveis[parseInt(cb.dataset.i, 10)])
				.filter(v => v && classificar(v) !== 'punida'); // trava final
			if (!sel.length) { alert('Selecione ao menos uma placa liberada.'); return; }
			if (cmdRestrito() && !desbloqueioLiberado()) {
				alert('A janela de envio (' + textoJanelaDesbloqueio() + ') se encerrou. Nenhum comando foi enviado.');
				return;
			}

			// tecnologias sem comando cadastrado n\u00E3o recebem nada
			const semComando = sel.filter(v => !comandoDaTecnologia(v.tecnologia, modoAtual()));
			const enviaveis = sel.filter(v => comandoDaTecnologia(v.tecnologia, modoAtual()));

			// agrupa por transportadora + tecnologia (o comando depende das duas)
			const grupos = {};
			enviaveis.forEach(v => {
				const chave = (v.cliente || '\u2014') + '\u241F' + (v.tecnologia || '');
				(grupos[chave] = grupos[chave] || []).push(v);
			});
			const nGrupos = new Set(enviaveis.map(v => v.cliente || '\u2014')).size;

			if (!enviaveis.length) {
				alert('Nenhuma placa selecionada tem comando cadastrado para a sua tecnologia:\n\n' +
					Array.from(new Set(semComando.map(v => v.tecnologia || '(sem tecnologia)'))).join(', '));
				return;
			}

			const porTec = {};
			enviaveis.forEach(v => {
				const c = comandoDaTecnologia(v.tecnologia, modoAtual());
				(porTec[v.tecnologia.toUpperCase()] = porTec[v.tecnologia.toUpperCase()] || { cmd: c, n: 0 }).n++;
			});
			const resumoCmd = Object.keys(porTec)
				.map(t => `\u2022 ${t} (${porTec[t].n}): ${porTec[t].cmd.label}`).join('\n');

			if (!confirm(`Enviar comando para ${enviaveis.length} placa(s) de ${nGrupos} transportadora(s)?\n\n` +
				resumoCmd + '\n\nAs placas em puni\u00E7\u00E3o ficam de fora.' +
				(semComando.length ? `\n\n${semComando.length} placa(s) sem comando para a tecnologia ficam de fora.` : ''))) return;

			// marca as que n\u00E3o t\u00EAm comando
			semComando.forEach(v => {
				const td = corpo.querySelector(`tr[data-i="${visiveis.indexOf(v)}"] .db-st`);
				if (td) td.innerHTML = `<span style="color:#b26a00;">\u26A0 ${escHtml(v.tecnologia || 'sem tecnologia')} sem comando cadastrado</span>`;
			});

			btn.disabled = true; btn.textContent = '\u23F3 Enviando...';
			let okTotal = 0, falhas = 0;
			try {
				for (const chave of Object.keys(grupos)) {
					const itens = grupos[chave];
					const cliente = chave.split('\u241F')[0];
					for (let i = 0; i < itens.length; i += DESBLOQ_LOTE) {
						const lote = itens.slice(i, i + DESBLOQ_LOTE);
						let ok = false;
						try { ok = await enviarDesbloqueio(cliente, lote, modoAtual()); }
						catch (e) { console.error('[DESBLOQ] erro no lote', chave, e); }
						lote.forEach(v => {
							const idx = visiveis.indexOf(v);
							const td = corpo.querySelector(`tr[data-i="${idx}"] .db-st`);
							if (td) td.innerHTML = ok
								? '<span style="color:#2e7d32;font-weight:bold;">\u2714 Comando enviado</span>'
								: '<span style="color:#b22222;">\u2716 Falha no envio</span>';
						});
						if (ok) okTotal += lote.length; else falhas += lote.length;
						btn.textContent = `\u23F3 Enviando... ${okTotal + falhas}/${enviaveis.length}`;
						if (i + DESBLOQ_LOTE < itens.length) await esperar(DESBLOQ_PAUSA_MS);
					}
				}
				alert(`Comando conclu\u00EDdo.\n\nEnviadas: ${okTotal}\nFalhas: ${falhas}` +
					(semComando.length ? `\nSem comando p/ a tecnologia: ${semComando.length}` : ''));
			} catch (e) {
				console.error('[DESBLOQ] erro geral:', e);
				alert('Erro no desbloqueio em massa. Veja o console (F12).');
			} finally {
				btn.disabled = false; btn.textContent = '\u{1F513} Enviar comando';
			}
		}
	}

	/* =========================================================
	   3j. AGUARDANDO PUNI\u00C7\u00C3O: quem pode iniciar
	   Ve\u00EDculo dentro de \u00E1rea liberada/alvo OU com autoriza\u00E7\u00E3o vigente
	   (Trafegar, Descarga/Rein\u00EDcio Noturno) N\u00C3O \u00E9 pass\u00EDvel de puni\u00E7\u00E3o.
	   ========================================================= */
	const URL_SUP_PUNICOES = 'https://gerenciamento.griscargo.com.br/griscargo/supervisao/punicoes.php';
	const URL_DADOS_LIBER  = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/dados_liberado.php';
	const URL_AUTORIZACAO  = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/autorizacao/lista.php';
	const URL_HISTORICO_POS = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/historicos/lista.php';

	async function buscarAguardandoPunicao(cdBase) {
		const url = `${URL_SUP_PUNICOES}?&cd_situacao=&cd_reagendado=&cd_pgr=0&cd_clifor=&cd_base=${encodeURIComponent(cdBase)}&dhxr${Date.now()}=1`;
		const html = await getTexto(url);
		const itens = [];
		try {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			doc.querySelectorAll('tbody tr').forEach(tr => {
				const tds = tr.querySelectorAll('td');
				if (tds.length < 6) return;
				const txt = i => (tds[i].textContent || '').replace(/\s+/g, ' ').trim();
				const placa = txt(2).toUpperCase();
				if (!RE_PLACA.test(placa)) return;
				// tratar(1,id) = aguardando puni\u00E7\u00E3o | tratar(2,id) = cumprindo (concluir)
				const mPun = (tr.innerHTML || '').match(/tratar\(\s*(\d+)\s*,\s*(\d+)\s*\)/i);
				itens.push({
					motorista: txt(0), empresa: txt(1), placa: placa,
					situacao: txt(3), tipo: txt(4), prazo: txt(5),
					estado: mPun ? mPun[1] : '', cdPunicao: mPun ? mPun[2] : ''
				});
			});
		} catch (e) { console.error('[PUNICOES] falha ao ler aguardando puni\u00E7\u00E3o:', e); }
		return itens;
	}

	// areas liberadas / alvos da transportadora (cache por cd_clifor)
	async function areasLiberadas(cdClifor) {
		T.__acAreasCache = T.__acAreasCache || {};
		if (T.__acAreasCache[cdClifor]) return T.__acAreasCache[cdClifor];
		let areas = [];
		try {
			const txt = await getTexto(`${URL_DADOS_LIBER}?cd_clifor=${encodeURIComponent(cdClifor)}`);
			const json = JSON.parse(txt.trim());
			if (Array.isArray(json)) areas = json;
		} catch (e) { console.warn('[PUNICOES] \u00E1reas indispon\u00EDveis para', cdClifor, e); }
		T.__acAreasCache[cdClifor] = areas;
		return areas;
	}

	function distanciaMetros(lat1, lon1, lat2, lon2) {
		const R = 6371000, rad = g => g * Math.PI / 180;
		const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
		const a = Math.sin(dLat / 2) ** 2 +
			Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
		return 2 * R * Math.asin(Math.sqrt(a));
	}

	// ray casting: ponto dentro do pol\u00EDgono [[lat,lon],...]
	function dentroDoPoligono(lat, lon, pontos) {
		let dentro = false;
		for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
			const yi = pontos[i][0], xi = pontos[i][1];
			const yj = pontos[j][0], xj = pontos[j][1];
			if (((yi > lat) !== (yj > lat)) &&
				(lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi)) dentro = !dentro;
		}
		return dentro;
	}

	/* Alvos mal cadastrados deixam o ve\u00EDculo "fora" da \u00E1rea mesmo estando na
	   empresa. Se houver alvo perto, avisamos para o operador conferir no mapa. */
	const ALVO_PROXIMO_M = 5000;

	function areaProxima(lat, lon, areas, limite) {
		if (lat == null || lon == null) return null;
		const max = limite || ALVO_PROXIMO_M;
		let melhor = null;
		for (const a of areas) {
			try {
				let d = null;
				if (a.tipo === 'raio' && isFinite(a.lat) && isFinite(a.lon)) {
					d = Math.max(0, distanciaMetros(lat, lon, a.lat, a.lon) - (+a.tamanho || 0));
				} else if (a.tipo === 'poligono' && Array.isArray(a.pontos) && a.pontos.length) {
					d = Math.min.apply(null, a.pontos.map(p => distanciaMetros(lat, lon, p[0], p[1])));
				}
				if (d != null && d <= max && (!melhor || d < melhor.dist)) melhor = { area: a, dist: Math.round(d) };
			} catch (e) { }
		}
		return melhor;
	}

	/* Posto n\u00E3o \u00E9 destino de viagem nem p\u00E1tio de cliente: parar num posto n\u00E3o
	   justifica deixar de punir. As demais \u00E1reas liberadas seguem impedindo. */
	const RE_AREA_POSTO = /\bPOSTOS?\b|AUTO\s*POSTOS?/i;   // singular e plural
	const ehAreaPosto = a => RE_AREA_POSTO.test(String((a && a.nome) || ''));

	function areaQueContem(lat, lon, areas) {
		if (lat == null || lon == null) return null;
		for (const a of areas) {
			try {
				if (a.tipo === 'poligono' && Array.isArray(a.pontos) && a.pontos.length > 2) {
					if (dentroDoPoligono(lat, lon, a.pontos)) return a;
				} else if (a.tipo === 'raio' && isFinite(a.lat) && isFinite(a.lon)) {
					if (distanciaMetros(lat, lon, a.lat, a.lon) <= (+a.tamanho || 0)) return a;
				}
			} catch (e) { }
		}
		return null;
	}

	// autoriza\u00E7\u00F5es vigentes do ve\u00EDculo (Trafegar, Descarga/Rein\u00EDcio Noturno...)
	/* S\u00F3 estas autoriza\u00E7\u00F5es impedem a puni\u00E7\u00E3o. Qualquer outra (troca de
	   motorista, manuten\u00E7\u00E3o, etc.) n\u00E3o tem rela\u00E7\u00E3o com o pernoite.        */
	const AUTORIZ_QUE_IMPEDEM = /TRAFEGAR|(DESCARGA|REIN[I\u00CD]CIO).*NOTURN|NOTURN.*(DESCARGA|REIN[I\u00CD]CIO)|RASTREADO\s+POR\s+OUTRA\s+GR|ESTADO\s+DESATIVADO/i;
	const autorizImpedePunicao = tipo => AUTORIZ_QUE_IMPEDEM.test(
		String(tipo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

	async function autorizacoesVigentes(cdVeiculo) {
		const html = await getTexto(`${URL_AUTORIZACAO}?cd_veiculo=${encodeURIComponent(cdVeiculo)}`);
		const vigentes = [];
		try {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			const agora = Date.now();
			doc.querySelectorAll('tr').forEach(tr => {
				const tds = tr.querySelectorAll('td');
				if (tds.length < 6) return;
				const txt = i => (tds[i].textContent || '').replace(/\s+/g, ' ').trim();
				if (!/^\d+$/.test(txt(0))) return; // pula o cabe\u00E7alho
				const de = parseDataBR(txt(3)), ate = parseDataBR(txt(4));
				const valida = (!de || de.getTime() <= agora) && (!ate || ate.getTime() >= agora);
				// s\u00F3 interessam Trafegar e Descarga/Rein\u00EDcio Noturno
				if (valida && autorizImpedePunicao(txt(1)))
					vigentes.push({ protocolo: txt(0), tipo: txt(1), por: txt(2), de: txt(3), ate: txt(4), modo: txt(5) });
			});
		} catch (e) { console.warn('[PUNICOES] autoriza\u00E7\u00F5es indispon\u00EDveis para', cdVeiculo, e); }
		return vigentes;
	}

	/* ===== HIST\u00D3RICO DE POSI\u00C7\u00D5ES (checagem das 3 \u00FAltimas antes de punir) =====
	   cd_mct e limitevel v\u00EAm do proprio clica() da linha do grid (mesma tupla de
	   cd_veiculo/cd_proprietario/cd_motorista usada no resto do script).             */
	const HISTORICO_JANELA_H = 6;    // janela de busca (h) - garante achar ao menos 3 pontos
	const HIST_TOLERANCIA_M  = 100;  // toler\u00E2ncia de deriva de GPS p/ considerar "mesmo local"

	function fmtDataHoraISOCurta(d) {
		const p2 = n => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
	}

	// [{dt, ts, lat, lon, vel, ig}], DESC (mais recente primeiro), como o proprio request devolve
	async function buscarHistoricoPosicoes(cdVeiculo, cdMct, limitevel) {
		const agora = new Date();
		const ini = new Date(agora.getTime() - HISTORICO_JANELA_H * 3600000);
		const url = `${URL_HISTORICO_POS}?tp=2&cd_veiculo=${encodeURIComponent(cdVeiculo)}&cd_velo=` +
			`&limitevel=${encodeURIComponent(limitevel || '')}` +
			`&TxDe=${encodeURIComponent(fmtDataHoraISOCurta(ini))}&TxAte=${encodeURIComponent(fmtDataHoraISOCurta(agora))}` +
			`&cd_mct=${encodeURIComponent(cdMct || '')}&cd_bkp=&cd_historico=0&ordenar=datahora&ordem=DESC`;
		const html = await getTexto(url);
		const posicoes = [];
		try {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			doc.querySelectorAll('#grid tbody tr').forEach(tr => {
				const tds = tr.querySelectorAll('td');
				if (tds.length < 11) return; // pula linhas de pagina\u00E7\u00E3o/total
				const dtTxt = (tds[2].textContent || '').trim();
				const dt = parseDataBR(dtTxt);
				if (!dt) return;
				const ig  = (tds[5].textContent || '').trim().toUpperCase(); // L=ligada, D=desligada
				const lat = parseFloat((tds[6].textContent || '').trim());
				const lon = parseFloat((tds[7].textContent || '').trim());
				const vel = parseInt((tds[9].textContent || '').replace(/\D/g, ''), 10);
				posicoes.push({ dt: dtTxt, ts: dt.getTime(), lat: lat, lon: lon, vel: isFinite(vel) ? vel : null, ig: ig });
			});
		} catch (e) { console.error('[PUNICOES] falha ao ler o hist\u00F3rico de posi\u00E7\u00F5es:', e); }
		return posicoes;
	}

	// analisa as N mais recentes: paradas (vel=0 nas 3) e se ficaram no mesmo local
	function analisarUltimasPosicoes(posicoes, n) {
		const ultimas = posicoes.slice(0, n || 3);
		if (!ultimas.length) return { disponivel: false, paradas: false, mesmoLocal: false, distMax: null, ultimas: [], horasAtras: null };
		const paradas = ultimas.every(p => p.vel === 0);
		let distMax = 0;
		for (let i = 0; i < ultimas.length; i++)
			for (let j = i + 1; j < ultimas.length; j++)
				distMax = Math.max(distMax, distanciaMetros(ultimas[i].lat, ultimas[i].lon, ultimas[j].lat, ultimas[j].lon));
		return {
			disponivel: true, paradas: paradas,
			mesmoLocal: paradas && distMax <= HIST_TOLERANCIA_M,
			distMax: Math.round(distMax), ultimas: ultimas,
			horasAtras: Math.round(((Date.now() - ultimas[0].ts) / 3600000) * 10) / 10
		};
	}

	/* ===== ORIGEM / DESTINO DA VIAGEM (mapapa.php) =====
	   O mapa desenha um L.circle para a origem e outro para o destino, com o raio
	   real de cada ponto. S\u00F3 aceitamos os c\u00EDrculos cujas coordenadas casam com os
	   marcadores "<b>Origem:</b>" / "<b>Destino:</b>" \u2014 assim \u00E1reas de risco e
	   liberadas desenhadas no mesmo mapa nunca s\u00E3o confundidas com ponto de viagem. */
	async function buscarOrigemDestino(cdVeiculo, cdClifor) {
		const agora = new Date();
		const ini = new Date(agora.getTime() - 2 * 3600000);
		const url = `${URL_MAPA}?equip=1&cd_veiculo=${encodeURIComponent(cdVeiculo)}&cd_clifor=${encodeURIComponent(cdClifor)}` +
			'&liberado=0&risco=0&trajeto=1&desloc=1&prf=0&posicionamento=0&clifor_clifor=0&acidente=0&postos=0' +
			'&postosrota=1&riscorota=1&liberadorota=1&report=0&paradas=1&macro=1' +
			`&dt_de=${encodeURIComponent(fmtDataHoraISOCurta(ini))}&dt_ate=${encodeURIComponent(fmtDataHoraISOCurta(agora))}`;
		const js = await getTexto(url);
		const pontos = [];
		try {
			// marcadores: dizem qual coordenada \u00E9 origem e qual \u00E9 destino
			const marcadores = [];
			const reMarker = /L\.marker\(\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\][\s\S]{0,400}?bindPopup\(\s*['"]<b>(Origem|Destino):<\/b><br>([^'"]*)/gi;
			let m;
			while ((m = reMarker.exec(js)) !== null) {
				marcadores.push({ tipo: m[3], nome: (m[4] || '').replace(/\s+/g, ' ').trim(),
					lat: parseFloat(m[1]), lon: parseFloat(m[2]) });
			}
			if (!marcadores.length) return pontos;

			// circulos com coordenada literal: trazem o raio de cada ponto
			const circulos = [];
			const reCirc = /L\.circle\(\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\s*,\s*(\d+(?:\.\d+)?)/gi;
			while ((m = reCirc.exec(js)) !== null) {
				circulos.push({ lat: parseFloat(m[1]), lon: parseFloat(m[2]), raio: parseFloat(m[3]) });
			}

			marcadores.forEach(mk => {
				const c = circulos.find(c => distanciaMetros(c.lat, c.lon, mk.lat, mk.lon) <= 50);
				pontos.push({ tipo: mk.tipo, nome: mk.nome, lat: mk.lat, lon: mk.lon, raio: c ? c.raio : 0 });
			});
		} catch (e) { console.warn('[PUNICOES] falha ao ler origem/destino:', e); }
		return pontos;
	}

	function pontoDeViagemQueContem(lat, lon, pontos) {
		if (lat == null || lon == null) return null;
		for (const p of pontos) {
			if (!p.raio) continue; // sem c\u00EDrculo casado: n\u00E3o d\u00E1 para afirmar o alcance
			if (distanciaMetros(lat, lon, p.lat, p.lon) <= p.raio) return p;
		}
		return null;
	}

	/* =========================================================
	   3k. LIBERA\u00C7\u00C3O EM MASSA (acoes_ajax.php?tp=autoriza_add)
	   ========================================================= */
	// o portal envia o motivo em latin-1 (escape), n\u00E3o em UTF-8
	async function enviarLiberacao(v, cfg, dtIni, dtFim, autorizou, motivo) {
		const url = `${URL_ACOES_AJAX}?tp=autoriza_add&cd_veiculo=${encodeURIComponent(v.cdVeiculo)}` +
			`&ds_motivo=${escape(motivo).replace(/\+/g, '%2B')}` +
			`&cd_tipo=${encodeURIComponent(cfg.cdTipo)}` +
			`&ds_autorizou=${escape(autorizou).replace(/\+/g, '%2B')}` +
			`&dt_ini=${dtIni}&dt_fim=${dtFim}&cd_cronico=0`;
		const res = await fetch(url, {
			headers: {
				"accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
				"upgrade-insecure-requests": "1"
			},
			method: "GET", mode: "cors", credentials: "include"
		});
		if (!res.ok) throw new Error('HTTP ' + res.status);   // resposta vem em branco quando d\u00E1 certo
		return true;
	}

	// comando enviado junto da libera\u00E7\u00E3o (uma placa por request)
	async function enviarComandoLiberacao(v, cfg) {
		const desc = `1 - ${v.placa} (${v.tecnologia || ''})`;
		const filtro = `Comando: ${cfg.comando.label} | Propriet\u00E1rio: ${v.cliente || cfg.nome}`;
		const url = `${URL_CMD_ACAO}?tp=E&veiculos=${encodeURIComponent(v.cdVeiculo)}` +
			`&cd_comando=${encodeURIComponent(cfg.comando.cd)}` +
			`&filtro=${encodeURIComponent(filtro)}&ds_veiculos=${encodeURIComponent(desc)}`;
		const txt = await getTexto(url);
		return /Envio Realizado com sucesso/i.test(txt);
	}

	/* Tipos de autoriza\u00E7\u00E3o do portal (select ds_autorizou > cd_tipo).
	   Usados na libera\u00E7\u00E3o por lista de placas.                             */
	const AUTORIZ_TIPOS = [
		['25', 'Aduana/Balsa'], ['21', 'Autorizar n\u00E3o Bloqueio de Pernoite'], ['8', 'Bot\u00E3o de P\u00E2nico'],
		['27', 'Descarga/Rein\u00EDcio Noturno'], ['12', 'Desvio de Rota'], ['10', 'Estado Desativado (Omnilink)'],
		['28', 'Estado Rastreado (Omnilink)'], ['18', 'Fora da Faixa de Temperatura'], ['13', 'Inverter a Rota'],
		['9', 'Liberar Ba\u00FA'], ['3', 'Manuten\u00E7\u00E3o'], ['30', 'Motorista PX (n\u00E3o usar macros)'],
		['22', 'N\u00E3o Autorizar Debloqueio de Pernoite'], ['14', 'N\u00E3o Usar Macro'],
		['32', 'Parada em \u00E1rea de risco'], ['34', 'Parada n\u00E3o Informada'], ['31', 'Parada n\u00E3o Programada'],
		['29', 'Parada Pr\u00F3xima a Origem'], ['11', 'Perda de Posi\u00E7\u00E3o'], ['24', 'Pernoitar em Local Inadequado'],
		['26', 'Pernoite em Resid\u00EAncia'], ['4', 'Portas'], ['35', 'Rodagem no RJ'], ['15', 'Rodando Bloqueado'],
		['23', 'Sem Espelhamento'], ['33', 'Sem Intelig\u00EAncia Embarcada'], ['2', 'Sensor de Desengate'],
		['16', 'Sirene Ativada'], ['17', 'Tempo de Parada Excedida'], ['999', 'Todos - RASTREADO POR OUTRA GR'],
		['1', 'Trafegar'], ['7', 'Viola\u00E7\u00E3o Antena'], ['5', 'Viola\u00E7\u00E3o Bateria'], ['19', 'Viola\u00E7\u00E3o de Jammer'],
		['20', 'Viola\u00E7\u00E3o de Teclado'], ['6', 'Viola\u00E7\u00E3o Painel']
	];

	/* Libera\u00E7\u00E3o por lista de placas: o operador cola as placas (uma por linha
	   ou separadas por espa\u00E7o/v\u00EDrgula), escolhe o tipo e o per\u00EDodo.          */
	/* Desfaz as libera\u00E7\u00F5es feitas agora: para cada placa, procura na lista de
	   autoriza\u00E7\u00F5es do ve\u00EDculo a que acabamos de criar (mesmo tipo, a mais
	   recente) e exclui pelo cd_autorizado.                                   */
	const URL_AUTORIZ_LISTA = 'https://gerenciamento.griscargo.com.br/griscargo/monitoramento/autorizacao/lista.php';

	async function autorizacaoRecente(cdVeiculo, cdTipo) {
		const html = await getTexto(`${URL_AUTORIZ_LISTA}?cd_veiculo=${encodeURIComponent(cdVeiculo)}&dhxr${Date.now()}=1`);
		const doc = new DOMParser().parseFromString(html, 'text/html');
		// o bot\u00E3o de excluir carrega o cd_autorizado
		const ids = [];
		doc.querySelectorAll('tr').forEach(tr => {
			const m = (tr.innerHTML || '').match(/autoriza_exc[^0-9]*(\d+)|cd_autorizado=(\d+)|excluir\(\s*(\d+)/i);
			if (m) ids.push({ id: m[1] || m[2] || m[3], texto: (tr.textContent || '').replace(/\s+/g, ' ').trim() });
		});
		return ids;
	}

	async function desfazerLiberacoes(btn, res) {
		const reg = T.__acUltimaLiberacao;
		if (!reg || !reg.itens || !reg.itens.length) { alert('Nada para desfazer nesta sess\u00E3o.'); return; }
		if (!confirm(`Desfazer ${reg.itens.length} libera\u00E7\u00E3o(\u00F5es) de "${reg.rotulo || ''}"?\n\n` +
			'As autoriza\u00E7\u00F5es criadas agora ser\u00E3o exclu\u00EDdas.')) return;

		const original = btn.textContent;
		btn.disabled = true;
		let ok = 0, erro = 0;
		for (let i = 0; i < reg.itens.length; i++) {
			const it = reg.itens[i];
			btn.textContent = `\u23F3 ${i + 1}/${reg.itens.length}`;
			try {
				const ids = await autorizacaoRecente(it.cdVeiculo, it.cdTipo);
				// a mais recente do tipo liberado: a primeira da lista costuma ser a \u00FAltima criada
				const alvo = ids.find(x => x.texto.toUpperCase().indexOf(String(it.rotulo || '').toUpperCase()) !== -1) || ids[0];
				if (!alvo || !alvo.id) throw new Error('autoriza\u00E7\u00E3o n\u00E3o localizada');
				const resp = await fetch(`${URL_ACOES_AJAX}?tp=autoriza_exc&cd_autorizado=${encodeURIComponent(alvo.id)}`, {
					headers: { "accept": "*/*", "accept-language": "pt-BR,pt;q=0.9" },
					method: "POST", mode: "cors", credentials: "include"
				});
				if (!resp.ok) throw new Error('HTTP ' + resp.status);
				ok++;
				console.log('[LIBERACAO] desfeita:', it.placa, 'cd_autorizado', alvo.id);
				await esperar(DESBLOQ_PAUSA_MS);
			} catch (e) {
				erro++;
				console.error('[LIBERACAO] falha ao desfazer', it.placa, e);
			}
		}
		btn.disabled = false; btn.textContent = original;
		T.__acUltimaLiberacao = null;
		alert(`Desfazer conclu\u00EDdo.\n\nRemovidas: ${ok}` + (erro ? `\nFalhas: ${erro}` : '') +
			(erro ? '\n\nConfira as que falharam na tela de autoriza\u00E7\u00F5es do ve\u00EDculo.' : ''));
	}

	function abrirLiberacaoPorLista() {
		D.getElementById('modal-liberacao-lista')?.remove();
		estiloJanelas();
		const p2 = n => String(n).padStart(2, '0');
		const agora = new Date();
		const iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
		const fim = new Date(agora.getTime() + 7 * 24 * 3600000);

		const modal = D.createElement('div');
		modal.id = 'modal-liberacao-lista';
		modal.className = 'cop-jan';
		modal.style.cssText =
			'position:fixed;top:6%;left:50%;transform:translateX(-50%);width:720px;max-width:96vw;' +
			'max-height:88vh;overflow:hidden;background:#fff;z-index:2147483000;display:flex;flex-direction:column;';
		modal.innerHTML =
			'<div id="ll-header" class="cop-jan-head" style="--cop-acento:#2E7D32;cursor:move;display:flex;align-items:center;gap:8px;user-select:none;">' +
			'<span style="flex:1;">\u2705 Libera\u00E7\u00E3o por lista de placas</span>' +
			'<button id="ll-fechar" class="cop-jan-x">\u2716</button></div>' +
			'<div style="flex:1 1 auto;min-height:0;overflow:auto;padding:12px 14px;font-size:13px;color:#222;">' +
			'<div style="margin-bottom:6px;">Placas (uma por linha, ou separadas por espa\u00E7o/v\u00EDrgula):</div>' +
			'<textarea id="ll-placas" rows="6" placeholder="RRN-2C82&#10;SPH-4B36&#10;RRN-2C62&#10;RRN-0G12" ' +
			'style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:12px;font-family:monospace;resize:vertical;"></textarea>' +
			'<div style="display:flex;gap:10px;align-items:center;margin-top:8px;flex-wrap:wrap;font-size:12px;">' +
			'<label style="display:flex;align-items:center;gap:4px;">Liberar:' +
			'<select id="ll-tipo" style="padding:3px 6px;border:1px solid #ccc;border-radius:4px;max-width:260px;">' +
			AUTORIZ_TIPOS.map(t => `<option value="${t[0]}">${escHtml(t[1])}</option>`).join('') +
			'</select></label>' +
			`<label style="display:flex;align-items:center;gap:4px;">De:<input id="ll-ini" type="datetime-local" value="${iso(agora)}" style="padding:3px 6px;border:1px solid #ccc;border-radius:4px;"></label>` +
			`<label style="display:flex;align-items:center;gap:4px;">At\u00E9:<input id="ll-fim" type="datetime-local" value="${iso(fim)}" style="padding:3px 6px;border:1px solid #ccc;border-radius:4px;"></label>` +
			'</div>' +
			'<div style="display:flex;gap:10px;align-items:center;margin-top:8px;flex-wrap:wrap;font-size:12px;">' +
			'<label style="display:flex;align-items:center;gap:4px;flex:1;">Motivo:' +
			'<input id="ll-motivo" type="text" value="Sensor com defeito - verificado na tecnologia" maxlength="150" style="flex:1;padding:3px 6px;border:1px solid #ccc;border-radius:4px;"></label>' +
			'</div>' +
			'<div style="margin-top:10px;display:flex;gap:10px;align-items:center;">' +
			'<button id="ll-liberar" style="background:#2E7D32;color:#fff;border:none;border-radius:8px;padding:9px 18px;font-weight:bold;cursor:pointer;">\u2705 Liberar</button>' +
			'<span id="ll-conta" style="font-size:12px;color:#777;"></span></div>' +
			'<div id="ll-result" style="margin-top:10px;"></div></div>';
		D.body.appendChild(modal);
		D.getElementById('ll-fechar').onclick = () => modal.remove();
		(function permitirArrastar(m, h) {
			h.onmousedown = (e) => {
				if (e.target.closest('button') || e.target.closest('a')) return;
				const r = m.getBoundingClientRect();
				const sx = e.clientX - r.left, sy = e.clientY - r.top;
				const mv = ev => { m.style.left = (ev.pageX - sx) + 'px'; m.style.top = (ev.pageY - sy) + 'px'; m.style.transform = 'none'; };
				const up = () => { D.removeEventListener('mousemove', mv); D.removeEventListener('mouseup', up); };
				D.addEventListener('mousemove', mv); D.addEventListener('mouseup', up);
				e.preventDefault();
			};
		})(modal, D.getElementById('ll-header'));

		const lerPlacas = () => {
			const txt = D.getElementById('ll-placas').value || '';
			const achadas = txt.toUpperCase().match(/[A-Z]{3}\s*-?\s*[0-9][A-Z0-9][0-9]{2}/g) || [];
			const unicas = [];
			achadas.forEach(p => {
				const n = p.replace(/\s|-/g, '');
				const fmt = n.slice(0, 3) + '-' + n.slice(3);
				if (unicas.indexOf(fmt) === -1) unicas.push(fmt);
			});
			return unicas;
		};
		const atualizarConta = () => {
			const n = lerPlacas().length;
			D.getElementById('ll-conta').textContent = n ? `${n} placa(s) reconhecida(s)` : '';
		};
		D.getElementById('ll-placas').oninput = atualizarConta;

		D.getElementById('ll-liberar').onclick = async () => {
			const placas = lerPlacas();
			const res = D.getElementById('ll-result');
			if (!placas.length) { alert('Nenhuma placa reconhecida no texto.'); return; }
			const cdTipo = D.getElementById('ll-tipo').value;
			const rotulo = D.getElementById('ll-tipo').selectedOptions[0].textContent;
			const dtIni = D.getElementById('ll-ini').value;
			const dtFim = D.getElementById('ll-fim').value;
			const motivo = (D.getElementById('ll-motivo').value || '').trim();
			if (!dtIni || !dtFim) { alert('Informe o per\u00EDodo da libera\u00E7\u00E3o.'); return; }
			if (new Date(dtIni) > new Date(dtFim)) { alert('A data final n\u00E3o pode ser anterior \u00E0 inicial.'); return; }
			if (!confirm(`Liberar "${rotulo}" para ${placas.length} placa(s)?\n\n` +
				`De:  ${dtIni.replace('T', ' ')}\nAt\u00E9: ${dtFim.replace('T', ' ')}\n\nMotivo: ${motivo || '\u2014'}`)) return;

			const btn = D.getElementById('ll-liberar');
			T.__acUltimaLiberacao = { quando: Date.now(), itens: [], rotulo: rotulo };
			btn.disabled = true;
			res.innerHTML = '<div style="color:#555;">\u23F3 Procurando as placas na base...</div>';
			let ok = 0, erro = 0;
			const linhas = [];
			try {
				for (let i = 0; i < placas.length; i++) {
					const placa = placas[i];
					btn.textContent = `\u23F3 ${i + 1}/${placas.length}`;
					let estado = '', cor = '#b22222';
					try {
						const d = await dadosDaPlaca(placa);
						if (!d || !d.cdVeiculo) throw new Error('placa n\u00E3o encontrada na base');
						// guarda para o desfazer saber onde procurar
						T.__acUltimaLiberacao = T.__acUltimaLiberacao || { quando: Date.now(), itens: [] };
						const nomes = await autorizadoresDaPlaca(d.cdVeiculo, placa);
						const quem = nomes.length ? sortear(nomes) : (usuarioAtual() || 'MONITORAMENTO');
						const url = `${URL_ACOES_AJAX}?tp=autoriza_add&cd_veiculo=${encodeURIComponent(d.cdVeiculo)}` +
							`&ds_motivo=${escape(motivo).replace(/\+/g, '%2B')}&cd_tipo=${encodeURIComponent(cdTipo)}` +
							`&ds_autorizou=${escape(quem).replace(/\+/g, '%2B')}` +
							`&dt_ini=${dtIni}&dt_fim=${dtFim}&cd_cronico=0`;
						const resp = await fetch(url, {
							headers: { "accept": "text/html,*/*;q=0.8", "accept-language": "pt-BR,pt;q=0.9" },
							method: "GET", mode: "cors", credentials: "include"
						});
						if (!resp.ok) throw new Error('HTTP ' + resp.status);
						ok++; estado = `\u2714 liberado (por ${quem})`; cor = '#2e7d32';
						T.__acUltimaLiberacao.itens.push({ placa: placa, cdVeiculo: d.cdVeiculo, cdTipo: cdTipo, rotulo: rotulo });
						await esperar(DESBLOQ_PAUSA_MS);
					} catch (e) {
						erro++; estado = '\u2716 ' + (e && e.message ? e.message : 'falhou');
						console.error('[LIBERACAO] falha em', placa, e);
					}
					linhas.push(`<tr style="border-bottom:1px solid #eee;"><td style="padding:5px;font-weight:bold;">${escHtml(placa)}</td>` +
						`<td style="padding:5px;color:${cor};">${escHtml(estado)}</td></tr>`);
					res.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>' +
						linhas.join('') + '</tbody></table>';
				}
				if (ok) {
					const barra = D.createElement('div');
					barra.style.cssText = 'margin-top:10px;padding:8px 10px;background:#fff3e0;border:1px solid #e0c39a;border-radius:6px;font-size:12px;color:#7a4a00;';
					barra.innerHTML = `Liberou por engano? <button id="ll-desfazer" style="background:#b26a00;color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:bold;cursor:pointer;margin-left:6px;">\u21BA Desfazer estas ${ok} libera\u00E7\u00E3o(\u00F5es)</button>`;
					res.appendChild(barra);
					D.getElementById('ll-desfazer').onclick = () => desfazerLiberacoes(D.getElementById('ll-desfazer'), res);
				}
				alert(`Libera\u00E7\u00E3o conclu\u00EDda.\n\nLiberadas: ${ok}` + (erro ? `\nFalhas: ${erro}` : '') +
					(ok ? '\n\nSe errou, use o bot\u00E3o Desfazer na janela.' : ''));
			} finally {
				btn.disabled = false; btn.textContent = '\u2705 Liberar';
			}
		};
	}

	function abrirLiberacaoMassa() {
		D.getElementById('modal-liberacao')?.remove();
		estiloJanelas();

		const modal = D.createElement('div');
		modal.id = 'modal-liberacao';
		modal.className = 'cop-jan';
		modal.style.cssText =
			'position:fixed;top:5%;left:50%;transform:translateX(-50%);width:940px;max-width:96vw;' +
			'max-height:90vh;background:#fff;z-index:2147483000;display:flex;flex-direction:column;';

		const p2 = n => String(n).padStart(2, '0');
		const cfg0 = LIBERACAO_CFG[0];

		modal.innerHTML =
			'<div id="lb-header" class="cop-jan-head" style="--cop-acento:#2E7D32;cursor:move;display:flex;align-items:center;gap:8px;user-select:none;">' +
			'<span style="flex:1;">\u2705 Libera\u00E7\u00E3o em massa</span>' +
			'<button id="lb-fechar" class="cop-jan-x">\u2716</button></div>' +
			'<div style="padding:8px 12px;border-bottom:1px solid #ddd;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;background:#fafafa;">' +
			'<label style="display:flex;align-items:center;gap:4px;">Frota:' +
			'<select id="lb-frota" style="padding:3px 6px;border:1px solid #ccc;border-radius:4px;">' +
			LIBERACAO_CFG.map((c, i) => `<option value="${i}">${escHtml(c.nome)} \u2014 ${escHtml(c.tipoRotulo)}</option>`).join('') +
			'</select></label>' +
			'<label style="display:flex;align-items:center;gap:4px;">Base:' +
			'<select id="lb-base" style="padding:3px 6px;border:1px solid #ccc;border-radius:4px;">' +
			'<option value="34" selected>Base 2</option><option value="33">Base 1</option><option value="26">Base Gral</option>' +
			'</select></label>' +
			`<label style="display:flex;align-items:center;gap:4px;">At\u00E9:<input id="lb-ate" type="text" value="${p2(cfg0.fimHora)}:${p2(cfg0.fimMin)}" maxlength="5" style="width:52px;padding:3px 6px;border:1px solid #ccc;border-radius:4px;text-align:center;"></label>` +
			'<button id="lb-carregar" style="background:#2E7D32;color:#fff;border:none;border-radius:6px;padding:6px 16px;font-weight:bold;cursor:pointer;">\u21BB Carregar placas</button>' +
			'<button id="lb-enviar" disabled style="background:#2E7D32;color:#fff;border:none;border-radius:6px;padding:6px 16px;font-weight:bold;cursor:pointer;margin-left:auto;opacity:.5;">\u2705 Liberar selecionadas</button>' +
			'</div>' +
			'<div style="padding:6px 12px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;background:#fff;">' +
			`<label style="display:flex;align-items:center;gap:4px;">Autorizado por:<input id="lb-quem" type="text" value="${escAttr(cfg0.autorizou)}" style="width:190px;padding:3px 6px;border:1px solid #ccc;border-radius:4px;"></label>` +
			`<label style="display:flex;align-items:center;gap:4px;flex:1;">Motivo:<input id="lb-motivo" type="text" value="${escAttr(cfg0.motivo)}" style="flex:1;min-width:200px;padding:3px 6px;border:1px solid #ccc;border-radius:4px;"></label>` +
			'</div>' +
			'<div id="lb-corpo" style="padding:10px 12px;overflow:auto;font-size:12px;color:#222;flex:1;">' +
			'Escolha a frota e clique em <b>Carregar placas</b>. A libera\u00E7\u00E3o vale de <b>agora</b> at\u00E9 o hor\u00E1rio indicado, <b>hoje</b>.' +
			'</div>';

		D.body.appendChild(modal);
		D.getElementById('lb-fechar').onclick = () => modal.remove();

		const header = D.getElementById('lb-header');
		header.onmousedown = (e) => {
			if (e.target.closest('button')) return;
			const sx = e.clientX - modal.getBoundingClientRect().left;
			const sy = e.clientY - modal.getBoundingClientRect().top;
			const mv = ev => { modal.style.left = (ev.pageX - sx) + 'px'; modal.style.top = (ev.pageY - sy) + 'px'; modal.style.transform = 'none'; };
			const up = () => { D.removeEventListener('mousemove', mv); D.removeEventListener('mouseup', up); };
			D.addEventListener('mousemove', mv); D.addEventListener('mouseup', up);
			e.preventDefault();
		};

		let visiveis = [];
		const cfgAtual = () => LIBERACAO_CFG[parseInt(D.getElementById('lb-frota').value, 10)] || LIBERACAO_CFG[0];

		D.getElementById('lb-frota').onchange = () => {
			const c = cfgAtual();
			D.getElementById('lb-quem').value = c.autorizou;
			D.getElementById('lb-motivo').value = c.motivo;
			D.getElementById('lb-ate').value = p2(c.fimHora) + ':' + p2(c.fimMin);
		};
		D.getElementById('lb-carregar').onclick = carregar;
		D.getElementById('lb-enviar').onclick = enviar;

		async function carregar() {
			const corpo = D.getElementById('lb-corpo');
			const btn = D.getElementById('lb-carregar');
			const cfg = cfgAtual();
			btn.disabled = true;
			corpo.innerHTML = '\u23F3 Carregando as placas da base...';
			try {
				const todas = await buscarVeiculosDaBase(D.getElementById('lb-base').value);
				visiveis = todas.filter(v => cfg.re.test(v.cliente || ''));
				if (!visiveis.length) {
					corpo.innerHTML = `<div style="padding:12px;color:#555;">Nenhuma placa da ${escHtml(cfg.nome)} nesta base.</div>`;
					return;
				}
				corpo.innerHTML =
					`<div style="margin-bottom:8px;"><b>${visiveis.length}</b> placa(s) da <b>${escHtml(cfg.nome)}</b> \u2014 ` +
					`libera\u00E7\u00E3o de <b>${escHtml(cfg.tipoRotulo)}</b> de agora at\u00E9 hoje \u00E0s <b>${escHtml(D.getElementById('lb-ate').value)}</b>` +
					(cfg.comando ? ` + comando <b>${escHtml(cfg.comando.label.replace(/^\d+-\d+-/, ''))}</b>` : '') + '.</div>' +
					'<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
					'<thead><tr style="background:#f5f5f5;text-align:left;">' +
					'<th style="padding:6px;border-bottom:1px solid #ccc;width:26px;"><input type="checkbox" id="lb-todos" checked></th>' +
					['Placa', 'Frota', 'Transportadora', 'Tec.', 'Situa\u00E7\u00E3o'].map(h =>
						`<th style="padding:6px;border-bottom:1px solid #ccc;">${h}</th>`).join('') +
					'</tr></thead><tbody>' +
					visiveis.map((v, i) =>
						'<tr style="border-bottom:1px solid #eee;">' +
						`<td style="padding:6px;"><input type="checkbox" class="lb-ck" data-i="${i}" checked></td>` +
						`<td style="padding:6px;font-weight:bold;">${escHtml(v.placa)}</td>` +
						`<td style="padding:6px;">${escHtml(v.frota || '\u2014')}</td>` +
						`<td style="padding:6px;">${escHtml(v.cliente || '\u2014')}</td>` +
						`<td style="padding:6px;">${escHtml(v.tecnologia || '\u2014')}</td>` +
						'<td style="padding:6px;color:#555;" class="lb-st">aguardando</td></tr>').join('') +
					'</tbody></table>';
				const cbT = D.getElementById('lb-todos');
				if (cbT) cbT.onchange = () => corpo.querySelectorAll('.lb-ck').forEach(c => { c.checked = cbT.checked; });
				const be = D.getElementById('lb-enviar');
				be.disabled = false; be.style.opacity = '1';
			} catch (e) {
				console.error('[LIBERACAO] erro ao carregar:', e);
				corpo.innerHTML = '<div style="padding:10px;color:#b22222;">Erro ao carregar as placas. Veja o console (F12).</div>';
			} finally { btn.disabled = false; }
		}

		async function enviar() {
			const corpo = D.getElementById('lb-corpo');
			const btn = D.getElementById('lb-enviar');
			const cfg = cfgAtual();
			const sel = Array.from(corpo.querySelectorAll('.lb-ck:checked')).map(c => visiveis[parseInt(c.dataset.i, 10)]);
			if (!sel.length) { alert('Selecione ao menos uma placa.'); return; }

			const ate = (D.getElementById('lb-ate').value || '').trim();
			const mAte = ate.match(/^(\d{1,2}):(\d{2})$/);
			if (!mAte || +mAte[1] > 23 || +mAte[2] > 59) { alert('Hor\u00E1rio final inv\u00E1lido. Use HH:MM.'); return; }

			const autorizou = (D.getElementById('lb-quem').value || '').trim();
			const motivo = (D.getElementById('lb-motivo').value || '').trim();
			if (!autorizou || !motivo) { alert('Informe quem autorizou e o motivo.'); return; }

			const agora = new Date();
			const iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
			const fim = new Date(agora); fim.setHours(+mAte[1], +mAte[2], 0, 0);
			if (fim.getTime() <= agora.getTime() &&
				!confirm(`O hor\u00E1rio final (${ate}) j\u00E1 passou.\n\nLiberar assim mesmo?`)) return;
			const dtIni = iso(agora), dtFim = iso(fim);

			if (!confirm(`Liberar ${cfg.tipoRotulo} de ${sel.length} placa(s) da ${cfg.nome}?\n\n` +
				`De: ${dtIni.replace('T', ' ')}\nAt\u00E9: ${dtFim.replace('T', ' ')}\n` +
				`Autorizado por: ${autorizou}\nMotivo: ${motivo}`)) return;

			btn.disabled = true;
			let ok = 0, erro = 0, cmdOk = 0, cmdErro = 0;
			for (const v of sel) {
				const td = corpo.querySelector(`tr:nth-child(${visiveis.indexOf(v) + 1}) .lb-st`);
				try {
					await enviarLiberacao(v, cfg, dtIni, dtFim, autorizou, motivo);
					ok++;
					if (td) td.innerHTML = `<span style="color:#2e7d32;font-weight:bold;">\u2714 Liberado at\u00E9 ${escHtml(ate)}</span>`;

					// comando que acompanha a libera\u00E7\u00E3o (ex.: Autoriza Desengate)
					if (cfg.comando) {
						try {
							const enviado = await enviarComandoLiberacao(v, cfg);
							if (enviado) {
								cmdOk++;
								if (td) td.innerHTML += ` <span style="color:#2e7d32;">+ ${escHtml(cfg.comando.label.replace(/^\d+-\d+-/, ''))}</span>`;
							} else {
								cmdErro++;
								if (td) td.innerHTML += ' <span style="color:#b26a00;">(comando sem confirma\u00E7\u00E3o)</span>';
							}
						} catch (eCmd) {
							cmdErro++;
							console.error('[LIBERACAO] erro no comando de', v.placa, eCmd);
							if (td) td.innerHTML += ' <span style="color:#b22222;">(falha no comando)</span>';
						}
						await esperar(DESBLOQ_PAUSA_MS);
					}
				} catch (e) {
					erro++;
					console.error('[LIBERACAO] erro em', v.placa, e);
					if (td) td.innerHTML = '<span style="color:#b22222;">\u2716 Falha</span>';
				}
				btn.textContent = `\u23F3 Liberando... ${ok + erro}/${sel.length}`;
			}
			btn.disabled = false; btn.textContent = '\u2705 Liberar selecionadas';
			alert(`Libera\u00E7\u00E3o conclu\u00EDda.\n\nLiberadas: ${ok}` + (erro ? `\nFalhas: ${erro}` : '') +
				(cfg.comando ? `\nComando "${cfg.comando.label.replace(/^\d+-\d+-/, '')}" enviado: ${cmdOk}` +
					(cmdErro ? `\nFalhas no comando: ${cmdErro}` : '') : '') +
				'\n\nConfira na tela de autoriza\u00E7\u00F5es do ve\u00EDculo.');
		}
	}

	/* =========================================================
	   3l. VELOCIDADE EM MASSA
	   Age apenas nas placas que est\u00E3o VIS\u00CDVEIS no grid do operador (l\u00EA o DOM,
	   n\u00E3o recarrega a base). Reagenda as ocorr\u00EAncias de Velocidade que j\u00E1
	   est\u00E3o no estado de reagendar; as de formalizar via grupo ficam para o
	   operador informar. Sem janela: confirma e executa.
	   ========================================================= */
	function recarregarGrid() {
		let achou = false;
		(function walk(j) {
			try {
				const doc = j.document;
				if (doc && doc.querySelector && doc.querySelector('td[data-id="ocorrencias"], td[data-id="localizacao"]')) {
					achou = true; j.location.reload(); return;
				}
				for (let i = 0; i < j.frames.length && !achou; i++) walk(j.frames[i]);
			} catch (e) { }
		})(T);
		return achou;
	}

	// placas que est\u00E3o na tela agora, direto do DOM do grid
	function veiculosVisiveisNoGrid() {
		const out = [], vistos = {};
		(function walk(j) {
			try {
				const doc = j.document;
				if (doc && doc.querySelectorAll) {
					doc.querySelectorAll('tr').forEach(tr => {
						const on = tr.getAttribute('onclick') || tr.getAttribute('onmousedown') || '';
						const m = on.match(/clica\(this,\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)'/i);
						if (!m || vistos[m[3]]) return;
						vistos[m[3]] = true;
						const td = id => tr.querySelector(`td[data-id="${id}"]`);
						out.push({
							placa: m[2], cdVeiculo: m[3], cdProp: m[7] || '',
							cliente: (td('cliente')?.textContent || '').replace(/\s+/g, ' ').trim(),
							tecnologia: (td('rastreador')?.textContent || '').replace(/\s+/g, ' ').trim(),
							ocorrencias: (td('ocorrencias')?.textContent || '').replace(/\s+/g, ' ').trim()
						});
					});
				}
				for (let i = 0; i < j.frames.length; i++) walk(j.frames[i]);
			} catch (e) { }
		})(T);
		return out;
	}

	async function velocidadeEmMassa() {
		const visiveis = veiculosVisiveisNoGrid();
		if (!visiveis.length) {
			alert('N\u00E3o consegui ler o grid. Abra o Grid Padr\u00E3o e tente de novo.');
			return;
		}
		const candidatas = visiveis.filter(v => RE_VELOCIDADE.test(v.ocorrencias || ''));
		if (!candidatas.length) {
			alert(`Nenhuma ocorr\u00EAncia de Velocidade nas ${visiveis.length} placas do grid.`);
			return;
		}
		if (!confirm(`${candidatas.length} placa(s) com Velocidade no grid:\n\n` +
			candidatas.slice(0, 12).map(v => '\u2022 ' + v.placa).join('\n') +
			(candidatas.length > 12 ? `\n\u2022 ... e mais ${candidatas.length - 12}` : '') +
			'\n\nReagendar as que j\u00E1 estiverem prontas?\n' +
			'As que estiverem no passo de formalizar via grupo N\u00C3O ser\u00E3o tratadas.')) return;

		const item = D.querySelector(`#${ID_CONSOLE_PAINEL} .cop-item[data-id="${ID_BOTAO_VELOCIDADE}"] .cop-txt`);
		const rotuloOriginal = item ? item.textContent : '';
		const progresso = t => { if (item) item.textContent = t; };

		let reagendadas = 0, grupo = 0, outras = 0, falhas = 0;
		const pendentes = [];
		try {
			for (let i = 0; i < candidatas.length; i++) {
				const v = candidatas[i];
				progresso(`Velocidade... ${i + 1}/${candidatas.length}`);
				try {
					const lista = await buscarListaOcorrencias(v.cdVeiculo, v.cdProp);
					const alvos = lista.ocorrencias.filter(o => RE_VELOCIDADE.test(o.alerta || ''));
					for (const o of alvos) {
						if (o.reagendar) {
							const dt = (lista.dtReag || '').trim();
							if (!/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/.test(dt)) { falhas++; continue; }
							await reagendarOcorrencia(o.cdAtua, o.cdEvento, v.cdVeiculo, dt);
							reagendadas++;
							console.log('[VELOCIDADE] reagendada', v.placa, dt);
						} else if (tipoPasso(o.passoLabel) === 'formalizar') {
							grupo++; pendentes.push(v.placa);
						} else {
							outras++;
						}
					}
				} catch (e) {
					falhas++;
					console.error('[VELOCIDADE] falha em', v.placa, e);
				}
			}
		} finally {
			progresso(rotuloOriginal);
		}

		const atualizou = recarregarGrid();
		alert('Velocidade em massa conclu\u00EDda.\n\n' +
			`Reagendadas: ${reagendadas}` +
			(grupo ? `\nAguardando informe no grupo: ${grupo}` +
				`\n  ${Array.from(new Set(pendentes)).slice(0, 10).join(', ')}` : '') +
			(outras ? `\nEm outro passo (n\u00E3o tratadas): ${outras}` : '') +
			(falhas ? `\nFalhas: ${falhas}` : '') +
			(atualizou ? '\n\nO grid foi atualizado.' : '\n\nAtualize o grid manualmente.'));
	}

	/* =========================================================
	   4b. CONSOLE DO OPERADOR (launcher + painel de a\u00E7\u00F5es)
	   Os bot\u00F5es originais continuam existindo (ocultos) e guardam toda a
	   l\u00F3gica; o console apenas dispara o clique deles. Assim a interface muda
	   sem mexer em nenhum fluxo j\u00E1 testado.
	   ========================================================= */
	const ID_CONSOLE_ESTILO = 'cop-estilo';
	const ID_CONSOLE_LAUNCH = 'cop-launcher';
	const ID_CONSOLE_PAINEL = 'cop-painel';

	// se\u00E7\u00F5es do menu: cada item aponta para o bot\u00E3o original pelo id
	function menuSecoes() {
		return [
			{ titulo: 'Placa selecionada', precisaPlaca: true, itens: [
				{ id: ID_BOTAO_LIGAR_FIXO,  icone: '\u{1F4DE}', rotulo: 'Ligar para o condutor', cor: '#35C07A', trailing: 'ligar', full: true },
				{ id: ID_BOTAO_TRATAR,      icone: '\u{1F6E0}', rotulo: 'Tratar ocorr\u00EAncias',   cor: '#00A98F', destaque: true },
				{ id: ID_BOTAO_INFORMATIVO, icone: '\u{1F4CB}', rotulo: 'Criar informativo',     cor: '#3D7BD6', destaque: true },
				{ id: ID_BOTAO_CONTATO,     icone: '\u260E',     rotulo: 'Tentativa de contato',  cor: '#7FA8B8' },
				{ id: ID_BOTAO_INFORMADO,   icone: '\u{1F4AC}', rotulo: 'Informado via grupo',   cor: '#7FA8B8' },
				{ id: ID_BOTAO,             icone: '\u{1F6A8}', rotulo: 'Fazer acionamento',     cor: '#E5484D', full: true }
			] },
			{ titulo: 'Sensores', itens: [
				{ id: ID_BOTAO_SENSORES,  icone: '\u{1F4E1}', rotulo: 'Alertas da placa',      cor: '#7C8CF8', precisaPlaca: true },
				{ id: ID_BOTAO_VARREDURA, icone: '\u{1F50E}', rotulo: 'Varredura',             cor: '#F07C2B' }
			] },
			{ titulo: 'Base', itens: [
				{ id: ID_BOTAO_PUNICOES, icone: '\u2696',     rotulo: 'Puni\u00E7\u00F5es',     cor: '#D6457F' },
				{ id: ID_BOTAO_DESBLOQ,  icone: '\u{1F513}', rotulo: 'Reset e desbloqueio', cor: '#3E9BE0' },
				{ id: 'cop-posicao',     icone: '\u{1F4CD}', rotulo: 'Solicitar posi\u00E7\u00E3o', cor: '#5C7CFA' },
				{ id: ID_BOTAO_LIBERACAO, icone: '\u2705',   rotulo: 'Libera\u00E7\u00E3o em massa', cor: '#2E7D32' },
				{ id: 'cop-liberar-lista', icone: '\u{1F4CB}', rotulo: 'Liberar por lista', cor: '#2E7D32' },
				{ id: ID_BOTAO_VELOCIDADE, icone: '\u{1F3CE}', rotulo: 'Velocidade em massa', cor: '#F07C2B' },
				{ id: ID_BOTAO_REGRAS,   icone: '\u{1F4D6}', rotulo: 'Regras da frota',  cor: '#C08A6A' },
				{ id: 'cop-novidades',   icone: '\u{1F4DC}', rotulo: 'Novidades',        cor: '#7C8CF8', trailing: 'versao' }
			] }
		];
	}

	/* ===== ESTILO \u00DANICO DAS JANELAS DO SCRIPT =====
	   Todas as janelas usam a mesma moldura (cantos, sombra, cabe\u00E7alho ardósia
	   como o console) e guardam a cor do m\u00F3dulo apenas como filete superior. */
	const ID_ESTILO_JANELAS = 'cop-estilo-janelas';
	function estiloJanelas() {
		if (D.getElementById(ID_ESTILO_JANELAS)) return;
		const st = D.createElement('style');
		st.id = ID_ESTILO_JANELAS;
		st.textContent = `
.cop-jan{border-radius:12px !important;border:1px solid #263A45 !important;
 box-shadow:0 22px 52px rgba(0,0,0,.5) !important;
 font-family:"Segoe UI",system-ui,-apple-system,sans-serif !important;overflow:hidden !important}
.cop-jan .cop-jan-head{background:#101B21 !important;color:#DDE8ED !important;
 padding:9px 13px !important;border-bottom:1px solid #1D2E37 !important;
 border-top:3px solid var(--cop-acento,#7C8CF8) !important;
 font:600 13.5px/1.2 "Segoe UI",system-ui,sans-serif !important;letter-spacing:.01em}
.cop-jan .cop-jan-head .cop-jan-x{background:transparent !important;border:0 !important;
 color:#7E97A3 !important;font-size:15px !important;cursor:pointer;padding:0 2px !important;
 border-radius:5px;transition:color .12s,background .12s}
.cop-jan .cop-jan-head .cop-jan-x:hover{color:#fff !important;background:#22343D !important}
.cop-jan button:focus-visible,.cop-jan input:focus-visible,.cop-jan select:focus-visible,
.cop-jan textarea:focus-visible{outline:2px solid #7C8CF8;outline-offset:1px}
@media (prefers-reduced-motion:reduce){.cop-jan .cop-jan-head .cop-jan-x{transition:none}}`;
		(D.head || D.documentElement).appendChild(st);
	}

	// tinta o fundo do item com o pr\u00F3prio acento do m\u00F3dulo
	function corRgba(hex, alfa) {
		const h = String(hex || '').replace('#', '');
		const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
		return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
	}

	function consoleEstilo() {
		if (D.getElementById(ID_CONSOLE_ESTILO)) return;
		const st = D.createElement('style');
		st.id = ID_CONSOLE_ESTILO;
		st.textContent = `
#${ID_CONSOLE_LAUNCH}{position:fixed;right:20px;bottom:20px;z-index:2147483647;display:flex;align-items:center;gap:9px;
 background:#101B21;color:#DDE8ED;border:1px solid #263A45;border-radius:11px;padding:9px 14px;cursor:pointer;
 font:600 12px/1 "Segoe UI",system-ui,sans-serif;box-shadow:0 10px 26px rgba(0,0,0,.45);transition:border-color .16s,transform .16s}
#${ID_CONSOLE_LAUNCH}:hover{border-color:#3C5766;transform:translateY(-1px)}
#${ID_CONSOLE_LAUNCH}:focus-visible{outline:2px solid #7C8CF8;outline-offset:2px}
#${ID_CONSOLE_LAUNCH} .cop-led{width:7px;height:7px;border-radius:50%;background:#35C07A;box-shadow:0 0 0 3px rgba(53,192,122,.16)}
#${ID_CONSOLE_LAUNCH} .cop-led.off{background:#4E6B79;box-shadow:0 0 0 3px rgba(78,107,121,.14)}
#${ID_CONSOLE_LAUNCH} .cop-lbl{font:600 12.5px/1 ui-monospace,"Cascadia Mono","Segoe UI Mono",Consolas,monospace;letter-spacing:.06em}
#${ID_CONSOLE_LAUNCH} .cop-chev{color:#5E7987;font-size:10px;margin-left:1px}

#${ID_CONSOLE_PAINEL}{position:fixed;right:20px;bottom:64px;z-index:2147482900;width:250px;max-height:calc(100vh - 96px);overflow:auto;
 background:#101B21;border:1px solid #263A45;border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,.5);
 font-family:"Segoe UI",system-ui,sans-serif;
 opacity:0;transform:translateY(5px);pointer-events:none;transition:opacity .13s ease,transform .13s ease}
#${ID_CONSOLE_PAINEL}.aberto{opacity:1;transform:translateY(0);pointer-events:auto}

.cop-cabeca{padding:10px 11px 9px;border-bottom:1px solid #1D2E37;background:#0C161B;display:flex;gap:10px;align-items:center}
.cop-placa{width:104px;flex:none;border-radius:4px;overflow:hidden;border:1.5px solid #0A0F12;background:#F2F5F6}
.cop-placa-tarja{background:#1D4E9B;color:#fff;font:700 5.5px/1 "Segoe UI",sans-serif;letter-spacing:.2em;
 text-align:center;padding:2px 0 1.5px}
.cop-placa-num{color:#111;text-align:center;padding:3px 0 4px;
 font:700 14px/1 ui-monospace,"Cascadia Mono","Segoe UI Mono",Consolas,monospace;letter-spacing:.06em}
.cop-placa.vazia{background:#16242C;border-color:#22343D}
.cop-placa.vazia .cop-placa-tarja{background:#22343D;color:#5E7987}
.cop-placa.vazia .cop-placa-num{color:#3E5765}
.cop-info{min-width:0;color:#7E97A3;font-size:10.5px;line-height:1.35}
.cop-info b{color:#B8CCD6;font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.cop-secao{padding:7px 0 6px}
.cop-secao+.cop-secao{border-top:1px solid #1A2A32}
.cop-eyebrow{color:#4E6B79;font:700 8.5px/1 "Segoe UI",sans-serif;letter-spacing:.15em;text-transform:uppercase;padding:0 11px 6px}
.cop-grade{display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:0 7px}
.cop-item{display:flex;align-items:center;gap:7px;min-width:0;box-sizing:border-box;padding:6px 7px 6px 6px;
 background:transparent;border:0;border-left:3px solid transparent;border-radius:0 5px 5px 0;color:#DDE8ED;
 cursor:pointer;text-align:left;font:500 11.5px/1.15 "Segoe UI",system-ui,sans-serif;
 transition:background .12s,padding-left .12s}
.cop-item.full{grid-column:1/-1}
.cop-item.destaque{background:var(--cop-bg);border-left-width:4px;padding:8px 7px 8px 6px;
 font-weight:600;font-size:12px;color:#EAF3F7}
.cop-item.destaque:hover:not(.bloqueado){background:var(--cop-bg-h)}
.cop-item.destaque .cop-ico{font-size:13px;filter:none}
.cop-item:hover:not(.bloqueado){background:#16242C;padding-left:8px}
.cop-item:focus-visible{outline:2px solid #7C8CF8;outline-offset:-2px}
.cop-item .cop-ico{width:14px;flex:none;text-align:center;font-size:12px;filter:grayscale(.15)}
.cop-item .cop-txt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.cop-item .cop-sub{display:block;color:#6F8794;font-size:10px;margin-top:2px;
 font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;letter-spacing:.02em}
.cop-item.bloqueado{color:#4A626E;cursor:not-allowed}
.cop-item.bloqueado .cop-ico{opacity:.4}
@media (prefers-reduced-motion:reduce){
 #${ID_CONSOLE_PAINEL},#${ID_CONSOLE_LAUNCH},.cop-item{transition:none}
}`;
		(D.head || D.documentElement).appendChild(st);
	}

	// placa selecionada no grid (para o cabe\u00E7alho do painel)
	function placaSelecionadaResumo() {
		let achou = null;
		(function walk(j) {
			if (achou) return;
			try {
				const doc = j.document;
				const tr = doc && doc.querySelector('tr.selecionado');
				if (tr) {
					const on = tr.getAttribute('onclick') || tr.getAttribute('onmousedown') || '';
					const m = on.match(/clica\(this,\s*'[^']*',\s*'([^']*)'/i);
					const td = id => tr.querySelector(`td[data-id="${id}"]`);
					achou = {
						placa: m ? m[1] : '',
						cliente: (td('cliente')?.textContent || '').replace(/\s+/g, ' ').trim(),
						vel: (td('vel')?.textContent || '').replace(/\D/g, ''),
						motorista: (td('motorista')?.textContent || '').replace(/\s+/g, ' ').trim()
					};
					return;
				}
				for (let i = 0; i < j.frames.length && !achou; i++) walk(j.frames[i]);
			} catch (e) { }
		})(T);
		return achou;
	}

	function consoleAtualizarPlaca() {
		const painel = D.getElementById(ID_CONSOLE_PAINEL);
		const launcher = D.getElementById(ID_CONSOLE_LAUNCH);
		if (!painel || !launcher) return;
		const sel = placaSelecionadaResumo();
		const placa = sel && sel.placa ? sel.placa : '';

		const elPlaca = painel.querySelector('.cop-placa');
		const elNum = painel.querySelector('.cop-placa-num');
		const elInfo = painel.querySelector('.cop-info');
		if (elNum) elNum.textContent = placa || '\u2013\u2013\u2013\u2013';
		if (elPlaca) elPlaca.classList.toggle('vazia', !placa);
		if (elInfo) {
			elInfo.innerHTML = placa
				? `<b>${escHtml(sel.cliente || 'sem transportadora')}</b>` +
				  `${sel.vel && +sel.vel > 0 ? 'em movimento \u00B7 ' + escHtml(sel.vel) + ' km/h' : 'parado'}`
				: 'Selecione uma placa no grid';
		}

		launcher.querySelector('.cop-lbl').textContent = placa || 'Central do Operador';
		launcher.querySelector('.cop-led').classList.toggle('off', !placa);

		// itens que dependem de placa
		painel.querySelectorAll('.cop-item[data-placa="1"]').forEach(it => {
			it.classList.toggle('bloqueado', !placa);
		});
	}

	function consoleAtualizarLigar(estado, telefone) {
		const it = D.querySelector(`#${ID_CONSOLE_PAINEL} .cop-item[data-id="${ID_BOTAO_LIGAR_FIXO}"]`);
		if (!it) return;
		const sub = it.querySelector('.cop-sub');
		const dig = (telefone || '').replace(/\D/g, '');
		if (estado === 'buscando') { sub.textContent = 'buscando n\u00FAmero\u2026'; it.classList.add('bloqueado'); it.__acNumero = ''; return; }
		if (dig.length >= 8) {
			sub.textContent = formatarExibicaoNumero(dig);
			it.classList.remove('bloqueado');
			it.__acNumero = dig;
			it.title = 'Bot\u00E3o direito copia o n\u00FAmero';
		} else {
			sub.textContent = 'sem n\u00FAmero cadastrado';
			it.classList.add('bloqueado');
			it.__acNumero = '';
			it.title = 'Nenhum telefone cadastrado para o condutor desta placa.';
		}
	}

	function montarConsole() {
		D.getElementById(ID_CONSOLE_LAUNCH)?.remove();
		D.getElementById(ID_CONSOLE_PAINEL)?.remove();
		consoleEstilo();

		// esconde os bot\u00F5es originais: viram apenas a l\u00F3gica por tr\u00E1s do console
		[ID_BOTAO, ID_BOTAO_LIGAR_FIXO, ID_BOTAO_INFORMADO, ID_BOTAO_CONTATO, ID_BOTAO_INFORMATIVO,
		 ID_BOTAO_TRATAR, ID_BOTAO_SENSORES, ID_BOTAO_VARREDURA, ID_BOTAO_REGRAS,
		 ID_BOTAO_PUNICOES, ID_BOTAO_DESBLOQ, ID_BOTAO_LIBERACAO, ID_BOTAO_VELOCIDADE, ID_BOTAO_MENU].forEach(id => {
			const b = D.getElementById(id);
			if (b) b.style.display = 'none';
		});

		const launcher = D.createElement('button');
		launcher.id = ID_CONSOLE_LAUNCH;
		launcher.type = 'button';
		launcher.innerHTML = '<span class="cop-led off"></span><span class="cop-lbl">Central do Operador</span><span class="cop-chev">\u25B2</span>';

		const painel = D.createElement('div');
		painel.id = ID_CONSOLE_PAINEL;
		painel.innerHTML =
			'<div class="cop-cabeca">' +
			'<div class="cop-placa vazia"><div class="cop-placa-tarja">BRASIL</div><div class="cop-placa-num">\u2013\u2013\u2013\u2013</div></div>' +
			'<div class="cop-info">Selecione uma placa no grid</div>' +
			'</div>' +
			menuSecoes().map(sec =>
				'<div class="cop-secao">' +
				`<div class="cop-eyebrow">${escHtml(sec.titulo)}</div>` +
				'<div class="cop-grade">' +
				sec.itens.map(it => {
					const precisa = it.precisaPlaca || sec.precisaPlaca;
					const cls = 'cop-item' + (it.full ? ' full' : '') + (it.destaque ? ' destaque' : '');
					const est = `border-left-color:${it.cor};` + (it.destaque
						? `--cop-bg:${corRgba(it.cor, .15)};--cop-bg-h:${corRgba(it.cor, .24)};` : '');
					return `<button type="button" class="${cls}" data-id="${it.id}"${precisa ? ' data-placa="1"' : ''}` +
						` style="${est}" title="${escAttr(it.rotulo)}">` +
						`<span class="cop-ico">${it.icone}</span>` +
						`<span class="cop-txt">${escHtml(it.rotulo)}` +
						(it.trailing === 'ligar' ? '<span class="cop-sub">sem placa selecionada</span>' : '') +
						(it.trailing === 'versao' ? `<span class="cop-sub">v${CENTRAL_VERSAO}</span>` : '') +
						'</span></button>';
				}).join('') +
				'</div></div>').join('');

		D.body.appendChild(painel);
		D.body.appendChild(launcher);

		const fechar = () => {
			T.__acConsoleAberto = false;
			painel.classList.remove('aberto');
			launcher.querySelector('.cop-chev').textContent = '\u25B2';
		};
		const abrir = () => {
			T.__acConsoleAberto = true;
			consoleAtualizarPlaca();
			painel.classList.add('aberto');
			launcher.querySelector('.cop-chev').textContent = '\u25BC';
		};
		launcher.onclick = (e) => { e.stopPropagation(); painel.classList.contains('aberto') ? fechar() : abrir(); };

		painel.querySelectorAll('.cop-item').forEach(item => {
			item.onclick = () => {
				if (item.classList.contains('bloqueado')) {
					if (item.dataset.placa === '1' && !placaSelecionadaResumo())
						alert('Selecione uma placa no grid primeiro.');
					return;
				}
				if (item.dataset.id === 'cop-novidades') { abrirChangelog(); return; }
				if (item.dataset.id === 'cop-posicao') { solicitarPosicaoDireto(); return; }
				if (item.dataset.id === 'cop-liberar-lista') { abrirLiberacaoPorLista(); return; }
				const alvo = D.getElementById(item.dataset.id);
				if (!alvo) { console.warn('[CONSOLE] a\u00E7\u00E3o indispon\u00EDvel:', item.dataset.id); return; }
				alvo.click(); // painel continua aberto para a\u00E7\u00F5es em sequ\u00EAncia
			};
			if (item.dataset.id === ID_BOTAO_LIGAR_FIXO) {
				item.oncontextmenu = (ev) => copiarNumeroSobDemanda(ev, item.__acNumero);
			}
		});

		// o painel NAO fecha ao clicar fora: fica dispon\u00EDvel o turno inteiro.
		// S\u00F3 fecha pelo pr\u00F3prio launcher ou por Esc.
		T.__acConsoleTecla = (e) => { if (e.key === 'Escape') fechar(); };
		D.addEventListener('keydown', T.__acConsoleTecla, true);

		// reabre no mesmo estado ap\u00F3s recarga do grid ou reinstala\u00E7\u00E3o do script
		if (T.__acConsoleAberto) abrir(); else consoleAtualizarPlaca();

		// a janela de hor\u00E1rio pode virar com o painel aberto o turno inteiro
		if (T.__acConsoleRelogio) clearInterval(T.__acConsoleRelogio);
		T.__acConsoleRelogio = setInterval(() => { try { consoleAtualizarPlaca(); } catch (e) { } }, 60000);
	}

	/* =========================================================
	   4. INJECAO DOS BOTOES (SUPERIOR E FLUTUANTES)
	   ========================================================= */
	function injetarBotoes() {
		// 1. Botao Flutuante FAZER ACIONAMENTO (junto dos demais, canto inferior direito)
		D.getElementById(ID_BOTAO)?.remove();

		const btn = D.createElement('button');
		btn.id = ID_BOTAO;
		btn.type = 'button';
		btn.textContent = '\u{1F6A8} Fazer Acionamento';
		btn.style.cssText =
			'position:fixed; bottom:384px; right:20px; z-index:2147483647;' +
			'background:#b22222; color:#fff; border:none; border-radius:50px;' +
			'padding:12px 22px; font:bold 13px "Segoe UI",Arial,sans-serif; cursor:pointer;' +
			'box-shadow:0 4px 12px rgba(0,0,0,0.4); transition: all 0.2s ease; border: 1px solid rgba(255,255,255,0.2);';
		btn.onmouseover = () => { btn.style.background = '#8f1b1b'; btn.style.transform = 'scale(1.05)'; };
		btn.onmouseout  = () => { btn.style.background = '#b22222'; btn.style.transform = 'scale(1)'; };
		btn.onclick = () => {
			const d = extrairDadosDaLinhaSelecionada();
			if (d) buscarCoordenadas(d, btn);
			else alert('Selecione um ve\u00EDculo no grid primeiro!');
		};

		D.body.appendChild(btn);

		// 2. Botao Flutuante LIGAR (condutor da placa selecionada)
		D.getElementById(ID_BOTAO_LIGAR_FIXO)?.remove();

		const btnLigarFixo = D.createElement('button');
		btnLigarFixo.id = ID_BOTAO_LIGAR_FIXO;
		btnLigarFixo.type = 'button';
		btnLigarFixo.textContent = '\u{1F4DE} Ligar';
		btnLigarFixo.__acNumero = '';
		btnLigarFixo.style.cssText =
			'position:fixed; bottom:72px; right:20px; z-index:2147483647;' +
			'background:#4CAF50; color:#fff; border:none; border-radius:50px;' +
			'padding:12px 22px; font:bold 13px "Segoe UI",Arial,sans-serif; cursor:pointer;' +
			'box-shadow:0 4px 12px rgba(0,0,0,0.4); transition: all 0.2s ease; border: 1px solid rgba(255,255,255,0.2);';

		btnLigarFixo.onmouseover = () => { if (!btnLigarFixo.disabled) btnLigarFixo.style.transform = 'scale(1.05)'; };
		btnLigarFixo.onmouseout  = () => { btnLigarFixo.style.transform = 'scale(1)'; };

		btnLigarFixo.onclick = () => {
			if (btnLigarFixo.disabled) return;
			const sipLink = formatarSip(btnLigarFixo.__acNumero || '');
			if (!sipLink) {
				alert('O condutor desta placa n\u00E3o tem n\u00FAmero cadastrado.');
				return;
			}

			// regra de pernoite por transportadora (Pecal/Rossini/Falleiro), SO com o veiculo parado
			const sel = acharLinhaSelecionada();
			const cli = sel ? (sel.querySelector('td[data-id="cliente"]')?.textContent.trim() || '')
			                : ((T.__acContatoAtual && T.__acContatoAtual.cliente) || '');
			const vel = velocidadeDaLinha(sel);
			const regra = pernoiteBloqueio(cli, vel);
			if (regra) {
				if (regra.permiteLigar) {
					// Falleiro: permite ligar em caso de suspeita de sinistro
					if (!confirm(textoPernoite(regra) +
						'\n\nDeseja realmente ligar?')) return;
				} else {
					// Pecal/Rossini: nao disca
					alert(textoPernoite(regra) + '\n\nLiga\u00E7\u00E3o n\u00E3o permitida neste hor\u00E1rio.');
					return;
				}
			}

			const link = D.createElement('a');
			link.href = sipLink;
			link.click();
		};

		btnLigarFixo.oncontextmenu = (ev) => copiarNumeroSobDemanda(ev, btnLigarFixo.__acNumero);

		D.body.appendChild(btnLigarFixo);

		// atualiza o botao Ligar conforme o TELEFONE recebido (do engate/motorista.php)
		atualizarLigarBotao = function (telefone) {
			const dig = (telefone || '').replace(/\D/g, '');
			if (dig.length >= 8) {
				btnLigarFixo.disabled = false;
				btnLigarFixo.__acNumero = dig;
				btnLigarFixo.style.background = '#4CAF50';
				btnLigarFixo.style.cursor = 'pointer';
				btnLigarFixo.style.opacity = '1';
				btnLigarFixo.textContent = `\u{1F4DE} Ligar (${formatarExibicaoNumero(dig)})`;
				btnLigarFixo.title = `Ligar para ${formatarExibicaoNumero(dig)}\n(bot\u00E3o direito copia o n\u00FAmero)`;
			} else {
				btnLigarFixo.disabled = true;
				btnLigarFixo.__acNumero = '';
				btnLigarFixo.style.background = '#9e9e9e';
				btnLigarFixo.style.cursor = 'not-allowed';
				btnLigarFixo.style.opacity = '0.6';
				btnLigarFixo.textContent = '\u260E Condutor sem n\u00FAmero';
				btnLigarFixo.title = 'Nenhum telefone cadastrado para o condutor desta placa.';
			}
				consoleAtualizarLigar('ok', telefone);
		};

		marcarLigarBuscando = function () {
			btnLigarFixo.disabled = true;
			btnLigarFixo.__acNumero = '';
			btnLigarFixo.style.background = '#9e9e9e';
			btnLigarFixo.style.cursor = 'wait';
			btnLigarFixo.style.opacity = '0.7';
			btnLigarFixo.textContent = '\u23F3 Buscando n\u00FAmero...';
			consoleAtualizarLigar('buscando');
		};

		// se ja houver uma placa selecionada, reflete no botao imediatamente
		try {
			const selAtual = acharLinhaSelecionada();
			if (selAtual && ehLinhaPlaca(selAtual)) atualizarLigarParaLinha(selAtual);
		} catch (e) {}

		// 3. Botao Flutuante INFORMADO VIA GRUPO
		D.getElementById(ID_BOTAO_INFORMADO)?.remove();

		const btnInformado = D.createElement('button');
		btnInformado.id = ID_BOTAO_INFORMADO;
		btnInformado.type = 'button';
		btnInformado.textContent = '\u{1F4AC} Informado via Grupo';
		btnInformado.style.cssText =
			'position:fixed; bottom:332px; right:20px; z-index:2147483647;' +
			'background:#FB8C00; color:#fff; border:none; border-radius:50px;' +
			'padding:12px 22px; font:bold 13px "Segoe UI",Arial,sans-serif; cursor:pointer;' +
			'box-shadow:0 4px 12px rgba(0,0,0,0.4); transition: all 0.2s ease; border: 1px solid rgba(255,255,255,0.2);';

		btnInformado.onmouseover = () => { btnInformado.style.background = '#ef8000'; btnInformado.style.transform = 'scale(1.05)'; };
		btnInformado.onmouseout  = () => { btnInformado.style.background = '#FB8C00'; btnInformado.style.transform = 'scale(1)'; };

		btnInformado.onclick = async () => {
			const dados = extrairDadosDaLinhaSelecionada();
			if (!dados) { alert('Selecione um ve\u00EDculo no grid primeiro!'); return; }
			if (!dados.cd_veiculo) { alert('N\u00E3o consegui identificar o cd_veiculo da linha selecionada.'); return; }

			const original = btnInformado.textContent;
			btnInformado.disabled = true;
			btnInformado.textContent = '\u23F3 Buscando alertas...';

			try {
				const alertas = await buscarAlertas(dados.cd_veiculo, dados.cd_clifor);

				if (!alertas.length) {
					alert('Nenhum alerta em aberto para ' + dados.placa + ' \u2014 nada para registrar.');
					return;
				}

				const nomes = [];
				alertas.forEach(a => {
					if (!a.alerta || ehOcorrenciaOculta(a.alerta)) return;
					if (ehOcorrenciaSemInformativo(a.alerta)) return;   // Velocidade n\u00E3o vai ao cliente
					if (nomes.indexOf(a.alerta) === -1) nomes.push(a.alerta);
				});

				if (!nomes.length) {
					alert('Nenhum alerta para registrar em ' + dados.placa + ' (al\u00E9m das autom\u00E1ticas e da Velocidade, que n\u00E3o \u00E9 informada ao cliente).');
					return;
				}

				const texto = nomes.join(', ') + SUFIXO_INFORMADO;

				if (!confirm('Registrar a seguinte anota\u00E7\u00E3o no ve\u00EDculo ' + dados.placa + '?\n\n"' + texto + '"')) return;

				btnInformado.textContent = '\u23F3 Registrando...';
				const resposta = await enviarComentarioVeiculo(texto, dados.cd_veiculo);

				if (resposta.indexOf('inserido com sucesso') !== -1) {
					alert('Anota\u00E7\u00E3o registrada com sucesso no ve\u00EDculo ' + dados.placa + '! \u2714');
				} else {
					console.warn('[INFORMADO] resposta inesperada do acao.php:', resposta.slice(0, 300));
					alert('O sistema n\u00E3o confirmou o registro. Veja o console (F12).');
				}
			} catch (e) {
				console.error('[INFORMADO] erro:', e);
				alert('Erro ao buscar os alertas ou registrar a anota\u00E7\u00E3o. Veja o console (F12).');
			} finally {
				btnInformado.textContent = original;
				btnInformado.disabled = false;
			}
		};

		D.body.appendChild(btnInformado);

		// 4. Botao Flutuante TENTATIVA DE CONTATO
		D.getElementById(ID_BOTAO_CONTATO)?.remove();

		const btnContato = D.createElement('button');
		btnContato.id = ID_BOTAO_CONTATO;
		btnContato.type = 'button';
		btnContato.textContent = '\u260E Tentativa de Contato';
		btnContato.style.cssText =
			'position:fixed; bottom:280px; right:20px; z-index:2147483647;' +
			'background:#1B7FB2; color:#fff; border:none; border-radius:50px;' +
			'padding:12px 22px; font:bold 13px "Segoe UI",Arial,sans-serif; cursor:pointer;' +
			'box-shadow:0 4px 12px rgba(0,0,0,0.4); transition: all 0.2s ease; border: 1px solid rgba(255,255,255,0.2);';

		btnContato.onmouseover = () => { btnContato.style.background = '#15678f'; btnContato.style.transform = 'scale(1.05)'; };
		btnContato.onmouseout  = () => { btnContato.style.background = '#1B7FB2'; btnContato.style.transform = 'scale(1)'; };

		btnContato.onclick = async () => {
			const dados = extrairDadosDaLinhaSelecionada();
			if (!dados) { alert('Selecione um ve\u00EDculo no grid primeiro!'); return; }
			if (!dados.cd_veiculo) { alert('N\u00E3o consegui identificar o cd_veiculo da linha selecionada.'); return; }

			const c = extrairContato(acharLinhaSelecionada());
			const nome = (c.nome || dados.motorista || '').trim();

			// considera "sem condutor" quando o nome esta vazio ou e o placeholder "Nao informado"
			const semNome = !nome || /^n[\u00E3a]o informado$/i.test(nome);

			let texto;
			const velTC = parseInt((dados.velocidade || '').replace(/\D/g, ''), 10);
			const regraPn = pernoiteBloqueio(dados.cliente, isNaN(velTC) ? null : velTC);
			if (regraPn) {
				// transportadora em horario de pernoite: registra o aviso de pernoite
				texto = textoPernoite(regraPn);
			} else {
				// telefone do condutor sempre do engate/motorista.php (Telefone1)
				let numeroContato = '';
				if (!semNome) {
					if (T.__acContatoAtual && T.__acContatoAtual.cdVeiculo === dados.cd_veiculo) {
						numeroContato = T.__acContatoAtual.telefone || '';
					} else {
						const originalTxt = btnContato.textContent;
						btnContato.disabled = true;
						btnContato.textContent = '\u23F3 Buscando n\u00FAmero...';
						try {
							numeroContato = await buscarTelefoneCondutor(dados.cd_veiculo, dados.cd_proprietario);
						} catch (e) { numeroContato = ''; }
						btnContato.textContent = originalTxt;
						btnContato.disabled = false;
					}
				}

				if (semNome) {
					// sem motorista cadastrado no veiculo
					texto = 'Sem condutor vinculado ao ve\u00EDculo.';
				} else if (!numeroContato) {
					// tem condutor, mas sem telefone cadastrado
					texto = 'Sem contato do condutor cadastrado.';
				} else {
					texto = `Tentativa de contato via fixo com o condutor ${nome} ${formatarExibicaoNumero(numeroContato)} sem sucesso.`;
				}
			}
			texto = texto.replace(/\s+/g, ' ').trim();

			if (!confirm('Registrar a seguinte anota\u00E7\u00E3o no ve\u00EDculo ' + dados.placa + '?\n\n"' + texto + '"')) return;

			const original = btnContato.textContent;
			btnContato.disabled = true;
			btnContato.textContent = '\u23F3 Registrando...';

			try {
				const resposta = await enviarComentarioVeiculo(texto, dados.cd_veiculo);
				if (resposta.indexOf('inserido com sucesso') !== -1) {
					alert('Anota\u00E7\u00E3o registrada com sucesso no ve\u00EDculo ' + dados.placa + '! \u2714');
				} else {
					console.warn('[CONTATO] resposta inesperada do acao.php:', resposta.slice(0, 300));
					alert('O sistema n\u00E3o confirmou o registro. Veja o console (F12).');
				}
			} catch (e) {
				console.error('[CONTATO] erro:', e);
				alert('Erro ao registrar a anota\u00E7\u00E3o. Veja o console (F12).');
			} finally {
				btnContato.textContent = original;
				btnContato.disabled = false;
			}
		};

		D.body.appendChild(btnContato);

		// 5. Botao Flutuante CRIAR INFORMATIVO
		D.getElementById(ID_BOTAO_INFORMATIVO)?.remove();

		const btnInformativo = D.createElement('button');
		btnInformativo.id = ID_BOTAO_INFORMATIVO;
		btnInformativo.type = 'button';
		btnInformativo.textContent = '\u{1F4CB} Criar Informativo';
		btnInformativo.style.cssText =
			'position:fixed; bottom:124px; right:20px; z-index:2147483647;' +
			'background:#8E24AA; color:#fff; border:none; border-radius:50px;' +
			'padding:12px 22px; font:bold 13px "Segoe UI",Arial,sans-serif; cursor:pointer;' +
			'box-shadow:0 4px 12px rgba(0,0,0,0.4); transition: all 0.2s ease; border: 1px solid rgba(255,255,255,0.2);';

		btnInformativo.onmouseover = () => { btnInformativo.style.background = '#7B1FA2'; btnInformativo.style.transform = 'scale(1.05)'; };
		btnInformativo.onmouseout  = () => { btnInformativo.style.background = '#8E24AA'; btnInformativo.style.transform = 'scale(1)'; };

		btnInformativo.onclick = async () => {
			const dados = extrairDadosDaLinhaSelecionada();
			if (!dados) { alert('Selecione um ve\u00EDculo no grid primeiro!'); return; }
			if (!dados.cd_veiculo) { alert('N\u00E3o consegui identificar o cd_veiculo da linha selecionada.'); return; }

			const originalText = btnInformativo.textContent;
			btnInformativo.disabled = true;
			btnInformativo.textContent = '\u23F3 Gerando...';

			try {
				const textoFinal = await gerarTextoInformativo(dados);
				copiarSilencioso(textoFinal).then(() => {
					alert('Informativo gerado e copiado para a \u00E1rea de transfer\u00EAncia! \u2714');
				});

			} catch (e) {
				console.error('[INFORMATIVO] erro:', e);
				alert('Erro ao criar informativo: ' + (e && e.message ? e.message : 'veja o console (F12).'));
			} finally {
				btnInformativo.textContent = originalText;
				btnInformativo.disabled = false;
			}
		};

		D.body.appendChild(btnInformativo);

		// 6. Botao Flutuante TRATAR OCORRENCIAS
		D.getElementById(ID_BOTAO_TRATAR)?.remove();

		const btnTratar = D.createElement('button');
		btnTratar.id = ID_BOTAO_TRATAR;
		btnTratar.type = 'button';
		btnTratar.textContent = '\u{1F6E0}\uFE0F Tratar Ocorr\u00EAncias';
		btnTratar.style.cssText =
			'position:fixed; bottom:176px; right:20px; z-index:2147483647;' +
			'background:#00695C; color:#fff; border:none; border-radius:50px;' +
			'padding:12px 22px; font:bold 13px "Segoe UI",Arial,sans-serif; cursor:pointer;' +
			'box-shadow:0 4px 12px rgba(0,0,0,0.4); transition: all 0.2s ease; border: 1px solid rgba(255,255,255,0.2);';

		btnTratar.onmouseover = () => { btnTratar.style.background = '#00544a'; btnTratar.style.transform = 'scale(1.05)'; };
		btnTratar.onmouseout  = () => { btnTratar.style.background = '#00695C'; btnTratar.style.transform = 'scale(1)'; };

		btnTratar.onclick = () => {
			const dados = extrairDadosDaLinhaSelecionada();
			if (!dados) { alert('Selecione um ve\u00EDculo no grid primeiro!'); return; }
			if (!dados.cd_veiculo) { alert('N\u00E3o consegui identificar o cd_veiculo da linha selecionada.'); return; }
			abrirTratarOcorrencias(dados);
		};

		D.body.appendChild(btnTratar);

		// 6b. Botao Flutuante ALERTAS DE SENSORES (secundario)
		D.getElementById(ID_BOTAO_SENSORES)?.remove();

		const btnSensores = D.createElement('button');
		btnSensores.id = ID_BOTAO_SENSORES;
		btnSensores.type = 'button';
		btnSensores.textContent = '\u{1F4E1} Alertas de Sensores';
		btnSensores.style.cssText =
			'position:fixed; bottom:228px; right:20px; z-index:2147483647;' +
			'background:#3949AB; color:#fff; border:none; border-radius:50px;' +
			'padding:12px 22px; font:bold 13px "Segoe UI",Arial,sans-serif; cursor:pointer;' +
			'box-shadow:0 4px 12px rgba(0,0,0,0.4); transition: all 0.2s ease; border: 1px solid rgba(255,255,255,0.2);';
		btnSensores.onmouseover = () => { btnSensores.style.background = '#303F9F'; btnSensores.style.transform = 'scale(1.05)'; };
		btnSensores.onmouseout  = () => { btnSensores.style.background = '#3949AB'; btnSensores.style.transform = 'scale(1)'; };
		btnSensores.onclick = () => {
			const dados = extrairDadosDaLinhaSelecionada();
			if (!dados) { alert('Selecione um ve\u00EDculo no grid primeiro!'); return; }
			if (!dados.cd_veiculo) { alert('N\u00E3o consegui identificar o cd_veiculo da linha selecionada.'); return; }
			abrirAlertasSensores(dados);
		};

		D.body.appendChild(btnSensores);

		// 6c. Botao Flutuante VARREDURA DE SENSORES (secundario)
		D.getElementById(ID_BOTAO_VARREDURA)?.remove();

		const btnVarredura = D.createElement('button');
		btnVarredura.id = ID_BOTAO_VARREDURA;
		btnVarredura.type = 'button';
		btnVarredura.textContent = '\u{1F50E} Varredura de Sensores';
		btnVarredura.style.cssText =
			'position:fixed; bottom:436px; right:20px; z-index:2147483647;' +
			'background:#E65100; color:#fff; border:none; border-radius:50px;' +
			'padding:12px 22px; font:bold 13px "Segoe UI",Arial,sans-serif; cursor:pointer;' +
			'box-shadow:0 4px 12px rgba(0,0,0,0.4); transition: all 0.2s ease; border: 1px solid rgba(255,255,255,0.2);';
		btnVarredura.onmouseover = () => { btnVarredura.style.background = '#BF4400'; btnVarredura.style.transform = 'scale(1.05)'; };
		btnVarredura.onmouseout  = () => { btnVarredura.style.background = '#E65100'; btnVarredura.style.transform = 'scale(1)'; };
		btnVarredura.onclick = () => abrirVarreduraSensores(); // varredura global: nao precisa de placa selecionada

		D.body.appendChild(btnVarredura);

		// 6d. Botao Flutuante REGRAS DA FROTA (secundario)
		D.getElementById(ID_BOTAO_REGRAS)?.remove();

		const btnRegras = D.createElement('button');
		btnRegras.id = ID_BOTAO_REGRAS;
		btnRegras.type = 'button';
		btnRegras.textContent = '\u{1F4D6} Regras da Frota';
		btnRegras.style.cssText =
			'position:fixed; bottom:488px; right:20px; z-index:2147483647;' +
			'background:#5D4037; color:#fff; border:none; border-radius:50px;' +
			'padding:12px 22px; font:bold 13px "Segoe UI",Arial,sans-serif; cursor:pointer;' +
			'box-shadow:0 4px 12px rgba(0,0,0,0.4); transition: all 0.2s ease; border: 1px solid rgba(255,255,255,0.2);';
		btnRegras.onmouseover = () => { btnRegras.style.background = '#4E342E'; btnRegras.style.transform = 'scale(1.05)'; };
		btnRegras.onmouseout  = () => { btnRegras.style.background = '#5D4037'; btnRegras.style.transform = 'scale(1)'; };
		btnRegras.onclick = () => abrirRegrasFrota(); // funciona com ou sem placa selecionada

		D.body.appendChild(btnRegras);

		// 6e. Botao Flutuante PUNICOES (secundario)
		D.getElementById(ID_BOTAO_PUNICOES)?.remove();

		const btnPunicoes = D.createElement('button');
		btnPunicoes.id = ID_BOTAO_PUNICOES;
		btnPunicoes.type = 'button';
		btnPunicoes.textContent = '\u2696 Puni\u00E7\u00F5es';
		btnPunicoes.style.cssText =
			'position:fixed; bottom:540px; right:20px; z-index:2147483647;' +
			'background:#AD1457; color:#fff; border:none; border-radius:50px;' +
			'padding:12px 22px; font:bold 13px "Segoe UI",Arial,sans-serif; cursor:pointer;' +
			'box-shadow:0 4px 12px rgba(0,0,0,0.4); transition: all 0.2s ease; border: 1px solid rgba(255,255,255,0.2);';
		btnPunicoes.onmouseover = () => { btnPunicoes.style.background = '#880E4F'; btnPunicoes.style.transform = 'scale(1.05)'; };
		btnPunicoes.onmouseout  = () => { btnPunicoes.style.background = '#AD1457'; btnPunicoes.style.transform = 'scale(1)'; };
		btnPunicoes.onclick = () => abrirPunicoes(); // funcao global: nao depende de placa

		D.body.appendChild(btnPunicoes);

		// 6f. Botao Flutuante DESBLOQUEIO EM MASSA (secundario)
		D.getElementById(ID_BOTAO_DESBLOQ)?.remove();

		const btnDesbloq = D.createElement('button');
		btnDesbloq.id = ID_BOTAO_DESBLOQ;
		btnDesbloq.type = 'button';
		btnDesbloq.textContent = '\u{1F513} Reset e desbloqueio em massa';
		btnDesbloq.style.cssText =
			'position:fixed; bottom:592px; right:20px; z-index:2147483647;' +
			'background:#1565C0; color:#fff; border:none; border-radius:50px;' +
			'padding:12px 22px; font:bold 13px "Segoe UI",Arial,sans-serif; cursor:pointer;' +
			'box-shadow:0 4px 12px rgba(0,0,0,0.4); transition: all 0.2s ease; border: 1px solid rgba(255,255,255,0.2);';
		btnDesbloq.onmouseover = () => { btnDesbloq.style.background = '#0D47A1'; btnDesbloq.style.transform = 'scale(1.05)'; };
		btnDesbloq.onmouseout  = () => { btnDesbloq.style.background = '#1565C0'; btnDesbloq.style.transform = 'scale(1)'; };
		btnDesbloq.onclick = () => abrirDesbloqueioMassa();

		D.body.appendChild(btnDesbloq);

		// 6g. Botao LIBERACAO EM MASSA (acionado pelo console)
		D.getElementById(ID_BOTAO_LIBERACAO)?.remove();
		const btnLiber = D.createElement('button');
		btnLiber.id = ID_BOTAO_LIBERACAO;
		btnLiber.type = 'button';
		btnLiber.textContent = '\u2705 Libera\u00E7\u00E3o em massa';
		btnLiber.style.cssText = 'position:fixed; bottom:644px; right:20px; z-index:2147483647;' +
			'background:#2E7D32; color:#fff; border:none; border-radius:50px; padding:12px 22px;' +
			'font:bold 13px "Segoe UI",Arial,sans-serif; cursor:pointer;';
		btnLiber.onclick = () => abrirLiberacaoMassa();
		D.body.appendChild(btnLiber);

		// 6h. Botao VELOCIDADE EM MASSA (acionado pelo console)
		D.getElementById(ID_BOTAO_VELOCIDADE)?.remove();
		const btnVeloc = D.createElement('button');
		btnVeloc.id = ID_BOTAO_VELOCIDADE;
		btnVeloc.type = 'button';
		btnVeloc.textContent = '\u{1F3CE} Velocidade em massa';
		btnVeloc.style.cssText = 'position:fixed; bottom:696px; right:20px; z-index:2147483647;' +
			'background:#F07C2B; color:#fff; border:none; border-radius:50px; padding:12px 22px;' +
			'font:bold 13px "Segoe UI",Arial,sans-serif; cursor:pointer;';
		btnVeloc.onclick = () => velocidadeEmMassa();
		D.body.appendChild(btnVeloc);

		// 7. CONSOLE: substitui a pilha de pilulas por um launcher + painel.
		//    Os botoes acima continuam no DOM (ocultos) guardando toda a logica.
		montarConsole();
	}

	injetarBotoes();

	instalarCapturaWhatsapp();
	T.__acWppInterval = setInterval(instalarCapturaWhatsapp, 2000);

	// laco rapido dedicado a manter o "Atualizar OBS no Grid" desmarcado
	enforcarCkGrid();
	if (T.__acCkGridInterval) { clearInterval(T.__acCkGridInterval); }
	T.__acCkGridInterval = setInterval(enforcarCkGrid, 700);

	/* ---------------------- desinstalar ---------------------- */
	T.centralRemover = T.acRemover = function () {
		T.__acWppOff = true;
		if (T.__acWppInterval) { clearInterval(T.__acWppInterval); T.__acWppInterval = null; }
		if (T.__acCkGridInterval) { clearInterval(T.__acCkGridInterval); T.__acCkGridInterval = null; }
		(function walk(j) {   // devolve o NewJan original e solta os observadores
			try {
				if (typeof j.NewJan === 'function' && j.NewJan.__acOriginal) j.NewJan = j.NewJan.__acOriginal;
				if (j.document && j.document.__acObsJanelas) {
					j.document.__acObsJanelas.disconnect();
					delete j.document.__acObsJanelas;
				}
				for (let i = 0; i < j.frames.length; i++) walk(j.frames[i]);
			} catch (e) { }
		})(T);
		D.getElementById(ID_BOTAO)?.remove();
		D.getElementById(ID_BOTAO_LIGAR_FIXO)?.remove();
		D.getElementById(ID_BOTAO_INFORMADO)?.remove();
		D.getElementById(ID_BOTAO_CONTATO)?.remove();
		D.getElementById(ID_BOTAO_INFORMATIVO)?.remove();
		D.getElementById(ID_BOTAO_TRATAR)?.remove();
		D.getElementById(ID_BOTAO_MENU)?.remove();
		D.getElementById(ID_BOTAO_SENSORES)?.remove();
		D.getElementById(ID_BOTAO_VARREDURA)?.remove();
		D.getElementById(ID_BOTAO_REGRAS)?.remove();
		D.getElementById(ID_BOTAO_PUNICOES)?.remove();
		D.getElementById(ID_BOTAO_DESBLOQ)?.remove();
		D.getElementById(ID_BOTAO_LIBERACAO)?.remove();
		D.getElementById(ID_BOTAO_VELOCIDADE)?.remove();
		D.getElementById('modal-liberacao')?.remove();
		D.getElementById(ID_CONSOLE_LAUNCH)?.remove();
		D.getElementById(ID_CONSOLE_PAINEL)?.remove();
		D.getElementById(ID_CONSOLE_ESTILO)?.remove();
		if (T.__acConsoleTecla) { D.removeEventListener('keydown', T.__acConsoleTecla, true); T.__acConsoleTecla = null; }
		if (T.__acConsoleRelogio) { clearInterval(T.__acConsoleRelogio); T.__acConsoleRelogio = null; }
		D.getElementById('modal-tratar-ocorrencias')?.remove();
		if (T.__acEsperaAcion) { clearInterval(T.__acEsperaAcion); T.__acEsperaAcion = null; }
		if (T.__acAtalhoPasso) { D.removeEventListener('keydown', T.__acAtalhoPasso, true); T.__acAtalhoPasso = null; }
		if (T.__acAjusteMapa) { T.removeEventListener('resize', T.__acAjusteMapa); T.__acAjusteMapa = null; }
		D.getElementById('modal-alertas-sensores')?.remove();
		D.getElementById('modal-varredura-sensores')?.remove();
		D.getElementById('modal-regras-frota')?.remove();
		D.getElementById('modal-punicoes')?.remove();
		D.getElementById('modal-mapa-placa')?.remove();
		D.getElementById('modal-desbloqueio')?.remove();
		D.getElementById('modal-changelog')?.remove();
		fecharModal();
		// solta os listeners de captura instalados nos frames
		(function walk(j) {
			try {
				const doc = j.document;
				if (doc) {
					if (doc.__acWppHandler) { doc.removeEventListener('click', onClickCaptura, true); delete doc.__acWppHandler; }
					if (doc.__acMsgHandler) { doc.removeEventListener('click', onClickAcionaWpp, true); delete doc.__acMsgHandler; }
				}
				for (let i = 0; i < j.frames.length; i++) walk(j.frames[i]);
			} catch (e) { }
		})(T);
		try { delete T.__acRascunhos; } catch (e) {}
		try { delete T.acRemover; } catch (e) {}
		try { delete T.centralRemover; } catch (e) {}
		console.log('[CENTRAL] removido.');
	};

	console.log('%c[CENTRAL DO OPERADOR] carregada \u2705 \u2014 v' + CENTRAL_VERSAO + ' (menu \u203A Novidades mostra o que mudou)', 'color:#0a0;font-weight:bold');
}

/* =====================================================================
   CONTROLADOR (Tampermonkey)
   Instala as ferramentas SOMENTE com o "Grid Padrao" aberto e as remove
   quando o operador troca de tela. O titulo e lido do <td id="otitle">
   dentro dos frames do portal.

   Comandos manuais no console (F12):
     centralDesligar()  -> desliga ate mandar ligar de novo
     centralLigar()     -> volta a instalar automaticamente
   ===================================================================== */
(function () {
	'use strict';
	if (window.top !== window.self) return; // reforco alem do @noframes

	const T = window.top;
	const CHECAGEM_MS = 1500;
	const RE_GRID = /grid\s*padr[a\u00E3]o/i;

	// usu\u00E1rio logado: 6\u00BA argumento do abrirModalMensagem(...) presente no grid
	function usuarioDoPortal() {
		if (T.__acUsuario) return String(T.__acUsuario).trim();
		let achou = '';
		(function walk(j) {
			if (achou) return;
			try {
				const doc = j.document;
				const el = doc && doc.querySelector('[onclick*="abrirModalMensagem"]');
				if (el) {
					const on = (el.getAttribute('onclick') || '').replace(/&quot;/g, '"');
					const m = on.match(/abrirModalMensagem\(\s*\d+\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"([^"]*)"/i);
					if (m && m[1].trim()) { achou = m[1].trim(); return; }
				}
				for (let i = 0; i < j.frames.length && !achou; i++) walk(j.frames[i]);
			} catch (e) { }
		})(T);
		return achou;
	}

	// procura o titulo da tela em todos os frames acessiveis
	function gridPadraoAberto() {
		let achou = false;
		(function walk(j) {
			if (achou) return;
			try {
				const doc = j.document;
				const el = doc && doc.getElementById('otitle');
				if (el && RE_GRID.test((el.textContent || '').trim())) { achou = true; return; }
				for (let i = 0; i < j.frames.length && !achou; i++) walk(j.frames[i]);
			} catch (e) { } // frame ainda carregando: ignora
		})(T);
		return achou;
	}

	// fonte da verdade: o proprio script publica T.centralRemover ao instalar
	const instalado = () => typeof T.centralRemover === 'function';

	const FALHAS_ATE_REMOVER = 4; // ~6s: os frames do portal recarregam o tempo todo

	function sincronizar() {
		if (T.__acDesligado) { if (instalado()) T.centralRemover(); return; }

		// o script \u00E9 liberado para qualquer operador; apenas a data/hora manual
		// de reagendamento e o hor\u00E1rio dos comandos seguem restritos (ver USUARIOS_SEM_RESTRICAO).
		const detectado = usuarioDoPortal();
		if (detectado) T.__acUsuarioOk = detectado;

		// t\u00EDtulo da tela: s\u00F3 remove ap\u00F3s falhas seguidas
		if (gridPadraoAberto()) {
			T.__acGridFalhas = 0;
			if (!instalado()) {
				try { centralInstalar(); }
				catch (e) { console.error('[CENTRAL] falha ao instalar:', e); }
			}
		} else if (instalado()) {
			T.__acGridFalhas = (T.__acGridFalhas || 0) + 1;
			if (T.__acGridFalhas >= FALHAS_ATE_REMOVER) {
				T.__acGridFalhas = 0;
				try { T.centralRemover(); } catch (e) { }
				console.log('[CENTRAL] Grid Padr\u00E3o fechado \u2014 ferramentas removidas.');
			}
		}
	}

	T.centralDesligar = function () { T.__acDesligado = true; sincronizar(); console.log('[CENTRAL] desligada. Use centralLigar() para voltar.'); };
	T.centralLigar    = function () { T.__acDesligado = false; sincronizar(); };

	if (T.__acWatch) clearInterval(T.__acWatch);
	T.__acWatch = setInterval(sincronizar, CHECAGEM_MS);
	sincronizar();
	console.log('%c[CENTRAL DO OPERADOR] monitor do Grid Padr\u00E3o ativo (Tampermonkey v13.5)', 'color:#0a0;font-weight:bold');
})();
