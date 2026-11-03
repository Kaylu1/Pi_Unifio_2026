import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const A4 = [595.28, 841.89];
const MARGIN = 46;
const COLORS = {
    ink: rgb(0.13, 0.14, 0.18),
    muted: rgb(0.38, 0.41, 0.47),
    accent: rgb(0.73, 0.27, 0.09),
    pale: rgb(1, 0.94, 0.89),
    line: rgb(0.87, 0.88, 0.90),
    white: rgb(1, 1, 1),
};
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const quantity = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const statusNames = {
    rascunho: 'Rascunho', publicado: 'Disponível ao cliente', pendente: 'Pendente',
    enviado: 'Enviado', aprovado: 'Aprovado', recusado: 'Recusado',
    parcial: 'Parcialmente aprovado', respondido: 'Respondido', expirado: 'Expirado', cancelado: 'Cancelado',
};

function printable(value, font) {
    const replacements = { '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '\u00a0': ' ' };
    let result = '';
    for (const char of String(value ?? '').replace(/[\r\n\t]+/g, ' ')) {
        const candidate = replacements[char] ?? char;
        try { font.encodeText(candidate); result += candidate; }
        catch { result += '?'; }
    }
    return result;
}

function fit(text, font, size, width) {
    if (font.widthOfTextAtSize(text, size) <= width) return text;
    while (text.length && font.widthOfTextAtSize(text + '...', size) > width) text = text.slice(0, -1);
    return text + '...';
}

function wrap(text, font, size, width) {
    const words = printable(text, font).split(/\s+/).filter(Boolean);
    if (!words.length) return ['-'];
    const lines = [];
    let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
        if (line) { lines.push(line); line = ''; }
        let remainder = word;
        while (font.widthOfTextAtSize(remainder, size) > width) {
            let part = '';
            for (const char of remainder) {
                if (font.widthOfTextAtSize(part + char, size) > width) break;
                part += char;
            }
            if (!part) part = remainder[0];
            lines.push(part);
            remainder = remainder.slice(part.length);
        }
        line = remainder;
    }
    if (line) lines.push(line);
    return lines;
}

function validDate(value) {
    if (!value || Number.isNaN(Date.parse(value))) return '-';
    return dateTime.format(new Date(value));
}

function amount(value) { return money.format(Number(value) || 0); }

export async function renderBudgetPdf({ budget, order, client, vehicle, settings }) {
    const document = await PDFDocument.create();
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    document.setTitle(`Orçamento ${budget.number ?? budget.id} - OScar`);
    document.setAuthor(printable(settings?.workshopName || 'OScar', regular));
    document.setSubject('Orçamento de serviços e peças da oficina');
    const pages = [];
    const width = A4[0];
    const right = width - MARGIN;
    const total = (budget.items ?? []).reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0);
    const approvedTotal = (budget.items ?? []).filter(item => item.decision === 'aprovado').reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0);
    const number = String(budget.number ?? budget.id);
    let page;

    function draw(value, x, y, size = 10, font = regular, color = COLORS.ink, maxWidth) {
        const text = printable(value, font);
        page.drawText(maxWidth ? fit(text, font, size, maxWidth) : text, { x, y, size, font, color });
    }
    function rightText(value, x, y, size = 10, font = regular, color = COLORS.ink) {
        const text = printable(value, font);
        draw(text, x - font.widthOfTextAtSize(text, size), y, size, font, color);
    }
    function addPage(continuation = false) {
        page = document.addPage(A4);
        pages.push(page);
        page.drawRectangle({ x: 0, y: 748, width, height: A4[1] - 748, color: COLORS.ink });
        page.drawRectangle({ x: MARGIN, y: 785, width: 7, height: 21, color: COLORS.accent });
        draw(settings?.workshopName || 'OScar', MARGIN + 19, 792, 19, bold, COLORS.white, 310);
        rightText(`ORÇAMENTO #${number}`, right, 795, 14, bold, COLORS.white);
        rightText(continuation ? 'CONTINUAÇÃO' : 'SERVIÇOS E PEÇAS', right, 778, 8, regular, COLORS.white);
        if (continuation) {
            draw('Itens do orçamento', MARGIN, 713, 16, bold);
            drawTableHead(682);
            return 658;
        }
        return 0;
    }
    function drawTableHead(y) {
        page.drawRectangle({ x: MARGIN, y: y - 10, width: width - 2 * MARGIN, height: 27, color: COLORS.pale });
        draw('DESCRIÇÃO', MARGIN + 10, y, 8, bold, COLORS.accent);
        rightText('QTD.', 378, y, 8, bold, COLORS.accent);
        rightText('UNITÁRIO', 455, y, 8, bold, COLORS.accent);
        rightText('TOTAL', right - 9, y, 8, bold, COLORS.accent);
    }

    addPage();
    draw('Cliente', MARGIN, 712, 8, bold, COLORS.muted);
    draw(client.name, MARGIN, 694, 12, bold, COLORS.ink, 240);
    draw('Veículo', 312, 712, 8, bold, COLORS.muted);
    draw([vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' '), 312, 694, 12, bold, COLORS.ink, 232);
    draw('Contato', MARGIN, 668, 8, bold, COLORS.muted);
    draw([client.phone, client.email].filter(Boolean).join('  ·  ') || '-', MARGIN, 651, 9, regular, COLORS.ink, 240);
    draw('Placa / O.S.', 312, 668, 8, bold, COLORS.muted);
    draw(`${vehicle.plate || '-'}  /  #${order.number ?? order.id}`, 312, 651, 10, regular, COLORS.ink, 232);
    page.drawLine({ start: { x: MARGIN, y: 629 }, end: { x: right, y: 629 }, thickness: 1, color: COLORS.line });
    draw('Status', MARGIN, 607, 8, bold, COLORS.muted);
    draw(statusNames[budget.status] || budget.status || '-', MARGIN, 589, 10, bold);
    draw('Emissão', 218, 607, 8, bold, COLORS.muted);
    draw(validDate(budget.publishedAt), 218, 589, 10);
    draw('Validade', 397, 607, 8, bold, COLORS.muted);
    draw(validDate(budget.expiresAt), 397, 589, 10);
    draw('Itens propostos', MARGIN, 551, 16, bold);
    drawTableHead(521);
    let y = 497;
    for (const item of budget.items ?? []) {
        const lines = wrap(item.description, regular, 9.5, 243);
        const decision = statusNames[item.decision] || item.decision;
        const rowHeight = Math.max(40, 17 + lines.length * 13 + (decision ? 11 : 0));
        if (y - rowHeight < 122) y = addPage(true);
        lines.forEach((line, index) => draw(line, MARGIN + 10, y - 12 - index * 13, 9.5));
        if (decision) draw(decision, MARGIN + 10, y - 12 - lines.length * 13, 8, regular, COLORS.muted);
        rightText(quantity.format(Number(item.quantity) || 0), 378, y - 12, 9);
        rightText(amount(item.price), 455, y - 12, 9);
        rightText(amount(Number(item.quantity || 0) * Number(item.price || 0)), right - 9, y - 12, 9, bold);
        page.drawLine({ start: { x: MARGIN, y: y - rowHeight }, end: { x: right, y: y - rowHeight }, thickness: 0.65, color: COLORS.line });
        y -= rowHeight;
    }
    if (y < 173) y = addPage(true);
    const responded = budget.status === 'respondido';
    page.drawRectangle({ x: 294, y: y - (responded ? 84 : 61), width: right - 294, height: responded ? 78 : 55, color: COLORS.pale });
    draw('TOTAL PROPOSTO', 308, y - 32, 8, bold, COLORS.accent);
    rightText(amount(total), right - 12, y - 32, responded ? 11 : 17, bold, COLORS.accent);
    if (responded) {
        draw('TOTAL APROVADO', 308, y - 63, 8, bold, COLORS.accent);
        rightText(amount(approvedTotal), right - 12, y - 63, 14, bold, COLORS.accent);
    }
    for (const [index, sheet] of pages.entries()) {
        page = sheet;
        page.drawLine({ start: { x: MARGIN, y: 69 }, end: { x: right, y: 69 }, thickness: 0.65, color: COLORS.line });
        draw('OScar · Orçamento para consulta. Itens sujeitos à aprovação registrada no atendimento.', MARGIN, 52, 8, regular, COLORS.muted, 430);
        rightText(`${index + 1} / ${pages.length}`, right, 52, 8, regular, COLORS.muted);
    }
    return document.save();
}
