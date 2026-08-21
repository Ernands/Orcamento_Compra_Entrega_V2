import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuoteAttachmentsPanel } from '../components/quote-attachments';
import {
  createSupplyQuoteAttachmentSignedUrl,
  deleteSupplyQuoteAttachment,
  listSupplyQuoteAttachments,
  uploadSupplyQuoteAttachment,
  validateQuoteAttachment,
  type QuoteAttachment,
} from '../data/attachments/quote-attachments-repository';

vi.mock('../data/attachments/quote-attachments-repository', async () => {
  const actual = await vi.importActual('../data/attachments/quote-attachments-repository');
  return {
    ...actual,
    createSupplyQuoteAttachmentSignedUrl: vi.fn(),
    deleteSupplyQuoteAttachment: vi.fn(),
    listSupplyQuoteAttachments: vi.fn(),
    uploadSupplyQuoteAttachment: vi.fn(),
    validateQuoteAttachment: vi.fn(),
  };
});

const quote = { id: 'quote-1', code: 'COT-00001' };

function attachment(id: string, originalName: string, mimeType: string): QuoteAttachment {
  return {
    id,
    quoteId: quote.id,
    originalName,
    storagePath: `cotacoes/${quote.id}/${id}/${originalName}`,
    mimeType,
    sizeBytes: 2048,
    description: `Descricao ${originalName}`,
    documentType: 'quote',
    createdAt: '2026-08-18T12:00:00Z',
  };
}

const imageAttachment = attachment('image-1', 'foto.png', 'image/png');
const pdfAttachment = attachment('pdf-1', 'proposta.pdf', 'application/pdf');
const videoAttachment = attachment('video-1', 'demonstracao.mp4', 'video/mp4');
const docAttachment = attachment(
  'doc-1',
  'condicoes.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
);
const spreadsheetAttachment = attachment(
  'sheet-1',
  'precos.xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
);

let windowOpenSpy: ReturnType<typeof vi.spyOn>;

describe('QuoteAttachmentsPanel', () => {
  beforeEach(() => {
    vi.mocked(listSupplyQuoteAttachments).mockResolvedValue([]);
    vi.mocked(validateQuoteAttachment).mockReturnValue(null);
    vi.mocked(uploadSupplyQuoteAttachment).mockResolvedValue();
    vi.mocked(deleteSupplyQuoteAttachment).mockResolvedValue();
    vi.mocked(createSupplyQuoteAttachmentSignedUrl).mockImplementation((path) =>
      Promise.resolve(`https://storage.example/signed/${encodeURIComponent(path)}`),
    );
    windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue(null);
  });

  it('envia automaticamente varios arquivos e confirma quando foram salvos', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    vi.mocked(listSupplyQuoteAttachments)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { ...pdfAttachment, originalName: 'cotacao.pdf', documentType: 'invoice' },
        { ...imageAttachment, originalName: 'produto.jpg', documentType: 'invoice' },
      ]);
    render(<QuoteAttachmentsPanel quote={quote} canEdit onChanged={onChanged} />);
    await screen.findByText('Nenhum anexo');

    await user.selectOptions(screen.getByLabelText('Tipo do documento'), 'invoice');
    await user.type(screen.getByLabelText('Descricao dos arquivos'), 'Documentos recebidos');
    const files = [
      new File(['pdf'], 'cotacao.pdf', { type: 'application/pdf' }),
      new File(['foto'], 'produto.jpg', { type: 'image/jpeg' }),
    ];
    await user.upload(screen.getByLabelText(/Selecionar e enviar arquivos/), files);

    expect(uploadSupplyQuoteAttachment).toHaveBeenNthCalledWith(
      1,
      quote.id,
      files[0],
      'Documentos recebidos',
      'invoice',
    );
    expect(uploadSupplyQuoteAttachment).toHaveBeenNthCalledWith(
      2,
      quote.id,
      files[1],
      'Documentos recebidos',
      'invoice',
    );
    expect(await screen.findByText(/2 arquivo\(s\) salvo\(s\) com sucesso/)).toBeInTheDocument();
    expect(screen.getAllByText(/Salvo ✓/)).toHaveLength(2);
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('mantem arquivos com falha para tentar novamente', async () => {
    const user = userEvent.setup();
    vi.mocked(uploadSupplyQuoteAttachment).mockRejectedValueOnce(new Error('falha de rede'));
    render(<QuoteAttachmentsPanel quote={quote} canEdit />);
    await screen.findByText('Nenhum anexo');
    const file = new File(['pdf'], 'cotacao.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/Selecionar e enviar arquivos/), file);
    expect(await screen.findByRole('button', { name: /Tentar novamente/ })).toBeInTheDocument();
  });

  it('previsualiza imagem, PDF e video por URL assinada', async () => {
    const user = userEvent.setup();
    vi.mocked(listSupplyQuoteAttachments).mockResolvedValue([
      imageAttachment,
      pdfAttachment,
      videoAttachment,
    ]);
    const { container } = render(<QuoteAttachmentsPanel quote={quote} canEdit />);
    await screen.findByText('foto.png');

    const imageRow = screen.getByText('foto.png').closest('article');
    await user.click(within(imageRow as HTMLElement).getByRole('button', { name: 'Visualizar' }));
    expect(await screen.findByRole('img', { name: 'foto.png' })).toHaveAttribute(
      'src',
      expect.stringContaining('image-1'),
    );
    await user.click(screen.getByRole('button', { name: 'Fechar visualizacao' }));

    const pdfRow = screen.getByText('proposta.pdf').closest('article');
    await user.click(within(pdfRow as HTMLElement).getByRole('button', { name: 'Visualizar' }));
    expect(container.querySelector('iframe[title="proposta.pdf"]')).toHaveAttribute(
      'src',
      expect.stringContaining('pdf-1'),
    );
    await user.click(screen.getByRole('button', { name: 'Fechar visualizacao' }));

    const videoRow = screen.getByText('demonstracao.mp4').closest('article');
    await user.click(within(videoRow as HTMLElement).getByRole('button', { name: 'Visualizar' }));
    expect(container.querySelector('video')).toHaveAttribute(
      'src',
      expect.stringContaining('video-1'),
    );
  });

  it('abre DOCX e XLSX em nova aba', async () => {
    const user = userEvent.setup();
    vi.mocked(listSupplyQuoteAttachments).mockResolvedValue([docAttachment, spreadsheetAttachment]);
    render(<QuoteAttachmentsPanel quote={quote} canEdit={false} />);
    const row = (await screen.findByText('condicoes.docx')).closest('article');
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Abrir' }));
    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringContaining('doc-1'),
      '_blank',
      'noopener,noreferrer',
    );
    const spreadsheetRow = screen.getByText('precos.xlsx').closest('article');
    await user.click(within(spreadsheetRow as HTMLElement).getByRole('button', { name: 'Abrir' }));
    expect(windowOpenSpy).toHaveBeenLastCalledWith(
      expect.stringContaining('sheet-1'),
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('permite remover com quotes.edit e oculta controles no modo somente leitura', async () => {
    const user = userEvent.setup();
    vi.mocked(listSupplyQuoteAttachments).mockResolvedValue([pdfAttachment]);
    const { rerender } = render(<QuoteAttachmentsPanel quote={quote} canEdit />);
    await screen.findByText('proposta.pdf');
    await user.click(screen.getByRole('button', { name: 'Remover proposta.pdf' }));
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    expect(deleteSupplyQuoteAttachment).toHaveBeenCalledWith(pdfAttachment.id);

    rerender(<QuoteAttachmentsPanel quote={quote} canEdit={false} />);
    expect(screen.queryByText('Selecionar e enviar arquivos')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover proposta.pdf' })).not.toBeInTheDocument();
  });
});
