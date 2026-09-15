import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  FileText,
  Footprints,
  FlaskConical,
  Gauge,
  HeartPulse,
  Image as ImageIcon,
  Info,
  Layers3,
  Loader2,
  Menu,
  MessageCircle,
  Mic,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Video,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  getGetCapabilitiesQueryKey,
  getHealthCheckQueryKey,
  useAnalyzeAudio,
  useAnalyzeDocument,
  useAnalyzeImage,
  useAnalyzeVideo,
  useChat,
  useGetCapabilities,
  useHealthCheck,
  useResearch,
  useScreen,
} from '@workspace/api-client-react';
import type {
  AnalysisResponse,
  AssistantResponse,
  AttachmentInput,
  ScreenResult,
  Source,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Link,
  Route,
  Router as WouterRouter,
  Switch,
} from 'wouter';
import './index.css';

const queryClient = new QueryClient();

type Language = 'en' | 'ur';
type AttachmentKind = 'image' | 'document' | 'audio' | 'video';

interface WorkspaceAttachment extends AttachmentInput {
  localId: string;
  file?: File;
  status: 'ready' | 'analyzing' | 'complete' | 'error';
  analysis?: AnalysisResponse;
}

const accentFor = (kind: AttachmentKind) => {
  if (kind === 'image') return 'text-[#b46155] bg-[#f7e8df]';
  if (kind === 'audio') return 'text-[#2b6d68] bg-[#dcefeb]';
  if (kind === 'video') return 'text-[#5c6ba8] bg-[#e4e6f5]';
  return 'text-[#8b6f35] bg-[#f5ecd2]';
};

const formatKind = (kind: AttachmentKind) => {
  if (kind === 'document') return 'PDF / document';
  if (kind === 'audio') return 'audio note';
  if (kind === 'video') return 'walking video';
  return 'image';
};

function AppMark() {
  return (
    <div className="flex items-center gap-3" data-testid="brand-mark">
      <div className="relative flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#9cc9bc] text-[#183b3b] shadow-[0_5px_0_#6d9e91]">
        <div className="absolute h-5 w-5 rounded-full border-[1.5px] border-[#183b3b]" />
        <div className="absolute h-[1.5px] w-8 rotate-45 bg-[#183b3b]" />
        <div className="absolute h-[1.5px] w-8 -rotate-45 bg-[#183b3b]" />
      </div>
      <div>
        <div className="serif text-[21px] leading-none text-[#f4eddd]">Murmur</div>
        <div className="mono mt-1 text-[9px] uppercase tracking-[0.17em] text-[#9fc4b8]">Parkinson’s research desk</div>
      </div>
    </div>
  );
}

function Sidebar({ activeSection }: { activeSection: 'assistant' | 'research' | 'screening' }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = (
    <div className={`${mobileOpen ? 'flex' : 'hidden'} fixed inset-0 z-40 flex-col bg-[#18302f] px-5 py-6 md:static md:flex md:w-[250px] md:shrink-0 md:px-6 md:py-7`}>
      <div className="flex items-center justify-between md:block">
        <AppMark />
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-2 text-[#d6e5dc] hover:bg-[#294745] md:hidden"
          data-testid="button-close-navigation"
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
      </div>
      <div className="mt-12">
        <p className="mono mb-3 px-3 text-[9px] uppercase tracking-[0.2em] text-[#8eaaa0]">Workspace</p>
        <nav className="space-y-1" aria-label="Primary navigation">
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${activeSection === 'assistant' ? 'bg-[#2b4a47] text-[#f5eedf]' : 'text-[#bfd0c7] hover:bg-[#294441] hover:text-[#f5eedf]'}`}
            data-testid="link-assistant"
          >
            <MessageCircle size={17} strokeWidth={1.8} />
            <span>Assistant desk</span>
            {activeSection === 'assistant' && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#e59b7d]" />}
          </Link>
          <Link
            href="/research"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${activeSection === 'research' ? 'bg-[#2b4a47] text-[#f5eedf]' : 'text-[#bfd0c7] hover:bg-[#294441] hover:text-[#f5eedf]'}`}
            data-testid="link-research"
          >
            <BookOpen size={17} strokeWidth={1.8} />
            <span>Research mode</span>
            {activeSection === 'research' && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#e59b7d]" />}
          </Link>
          <Link
            href="/screening"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${activeSection === 'screening' ? 'bg-[#2b4a47] text-[#f5eedf]' : 'text-[#bfd0c7] hover:bg-[#294441] hover:text-[#f5eedf]'}`}
            data-testid="link-screening"
          >
            <HeartPulse size={17} strokeWidth={1.8} />
            <span>Screening desk</span>
            {activeSection === 'screening' && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#e59b7d]" />}
          </Link>
        </nav>
      </div>
      <div className="mt-auto hidden rounded-2xl border border-[#365450] bg-[#213d3a] p-4 md:block">
        <div className="flex items-center gap-2 text-[#b8d8cd]">
          <ShieldCheck size={15} />
          <span className="mono text-[9px] uppercase tracking-[0.16em]">Careful by design</span>
        </div>
        <p className="mt-3 text-[12px] leading-5 text-[#a8c1b8]">Evidence first. Plain language. No diagnostic claims.</p>
      </div>
      <div className="mt-7 border-t border-[#365450] pt-5 md:mt-5">
        <div className="flex items-center gap-2 px-2 text-[#89a79c]">
          <div className="h-2 w-2 rounded-full bg-[#87c8ad]" />
          <span className="mono text-[9px] uppercase tracking-[0.16em]">Prototype environment</span>
        </div>
      </div>
    </div>
  );
  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-30 rounded-xl border border-[#d7d3c9] bg-[#f8f4e9] p-2.5 text-[#284948] shadow-sm md:hidden"
        data-testid="button-open-navigation"
        aria-label="Open navigation"
      >
        <Menu size={18} />
      </button>
      {nav}
    </>
  );
}

function TopBar({ activeSection, language, onLanguageChange }: { activeSection: 'assistant' | 'research' | 'screening'; language: Language; onLanguageChange: (language: Language) => void }) {
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const sectionLabel = activeSection === 'research' ? 'Research mode' : activeSection === 'screening' ? 'Screening desk' : 'Assistant desk';
  const sectionHeadline = activeSection === 'research' ? 'Read the field more closely' : activeSection === 'screening' ? 'Speech and gait screening' : 'A quieter way to ask';
  return (
    <header className="flex min-h-[76px] items-center justify-between border-b border-[#ddd8cc] px-5 py-4 md:px-10" data-testid="header-workspace">
      <div className="pl-12 md:pl-0">
        <div className="mono text-[9px] uppercase tracking-[0.19em] text-[#7e8179]">Murmur / {sectionLabel}</div>
        <h1 className="mt-1 text-[15px] font-semibold text-[#263b3b]">{sectionHeadline}</h1>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="hidden items-center gap-2 rounded-full border border-[#d8d8cb] bg-[#f8f6ef] px-3 py-2 sm:flex">
          <span className={`h-1.5 w-1.5 rounded-full ${health.isError ? 'bg-[#b46155]' : 'bg-[#6fae93]'}`} />
          <span className="mono text-[9px] uppercase tracking-[0.13em] text-[#6c756e]">{health.isLoading ? 'checking desk' : health.isError ? 'offline' : 'desk online'}</span>
        </div>
        <div className="flex rounded-full border border-[#d8d8cb] bg-[#f8f6ef] p-0.5" role="group" aria-label="Language">
          <button type="button" onClick={() => onLanguageChange('en')} className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${language === 'en' ? 'bg-[#284948] text-[#f8f4e9]' : 'text-[#778078]'}`} data-testid="button-language-en">EN</button>
          <button type="button" onClick={() => onLanguageChange('ur')} className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${language === 'ur' ? 'bg-[#284948] text-[#f8f4e9]' : 'text-[#778078]'}`} data-testid="button-language-ur">اردو</button>
        </div>
      </div>
    </header>
  );
}

function CapabilitiesRail() {
  const capabilities = useGetCapabilities({ query: { queryKey: getGetCapabilitiesQueryKey() } });
  const items = capabilities.data?.capabilities ?? [
    { id: 'text', label: 'Text questions', available: true, detail: 'Plain-language answers with context' },
    { id: 'image', label: 'Image context', available: true, detail: 'Describe visible, non-diagnostic cues' },
    { id: 'document', label: 'PDF extraction', available: true, detail: 'Pull out useful passages' },
    { id: 'audio', label: 'Audio notes', available: true, detail: 'Transcribe and summarize speech' },
    { id: 'gait_screening', label: 'Gait screening', available: false, detail: 'Set GAIT_SERVICE_URL to enable real scores' },
  ];
  return (
    <section className="mt-8 border-t border-[#ddd8cc] pt-6" aria-label="Capabilities" data-testid="section-capabilities">
      <div className="flex items-center justify-between">
        <p className="mono text-[9px] uppercase tracking-[0.18em] text-[#85867e]">What this desk can do</p>
        <span className={`rounded-full px-2 py-1 mono text-[8px] uppercase tracking-[0.12em] ${capabilities.isError ? 'bg-[#f7e8df] text-[#a6534a]' : 'bg-[#e3f0e8] text-[#36725e]'}`}>{capabilities.isLoading ? 'syncing' : capabilities.isError ? 'limited' : 'available'}</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((capability) => (
          <div className="rounded-xl border border-[#ded9cc] bg-[#f8f5ec] p-3" key={capability.id} data-testid={`capability-${capability.id}`}>
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${capability.available ? 'bg-[#66a88d]' : 'bg-[#bc8878]'}`} />
              <span className="text-[11px] font-semibold text-[#334847]">{capability.label}</span>
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-[#7a817a]">{capability.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function screeningSummary(analysis?: AnalysisResponse): { probability: number; classification: string } | null {
  if (!analysis || analysis.status !== 'success') return null;
  const probability = analysis.features?.screening_probability;
  const classification = analysis.features?.classification;
  if (typeof probability !== 'number') return null;
  return { probability, classification: typeof classification === 'string' ? classification : 'screened' };
}

function classificationLabel(classification: string) {
  if (classification === 'higher_screening_signal') return 'Higher screening signal';
  if (classification === 'intermediate_screening_signal') return 'Intermediate screening signal';
  if (classification === 'lower_screening_signal') return 'Lower screening signal';
  return classification;
}

function classificationColor(classification: string) {
  if (classification === 'higher_screening_signal') return 'text-[#a6534a] bg-[#f7e8df]';
  if (classification === 'intermediate_screening_signal') return 'text-[#8b6f35] bg-[#f5ecd2]';
  return 'text-[#36725e] bg-[#e3f0e8]';
}

function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown-body text-[16px] leading-8 text-[#354b47]" data-testid="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h2 className="serif mt-6 mb-2 text-[22px] leading-tight text-[#284948] first:mt-0">{children}</h2>,
          h2: ({ children }) => <h3 className="serif mt-5 mb-2 text-[19px] leading-tight text-[#284948] first:mt-0">{children}</h3>,
          h3: ({ children }) => <h4 className="mt-4 mb-1.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-[#557067] first:mt-0">{children}</h4>,
          p: ({ children }) => <p className="mb-3.5 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-[#243b39]">{children}</strong>,
          ul: ({ children }) => <ul className="mb-3.5 ml-5 list-disc space-y-1.5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3.5 ml-5 list-decimal space-y-1.5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-[#b46155] underline decoration-[#e2b6a6] underline-offset-2 hover:text-[#93493f]">{children}</a>,
          hr: () => <hr className="my-5 border-[#e2ddd0]" />,
          blockquote: ({ children }) => <blockquote className="my-3.5 border-l-2 border-[#c9a06d] pl-3.5 text-[#5f6863] italic">{children}</blockquote>,
          code: ({ children }) => <code className="rounded bg-[#eee9dc] px-1.5 py-0.5 font-mono text-[13px] text-[#4a5651]">{children}</code>,
          table: ({ children }) => (
            <div className="mb-4 overflow-x-auto rounded-xl border border-[#e2ddd0]">
              <table className="w-full border-collapse text-[14px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[#f1ede0]">{children}</thead>,
          th: ({ children }) => <th className="border-b border-[#e2ddd0] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[#7e8179]">{children}</th>,
          td: ({ children }) => <td className="border-b border-[#ece7da] px-3 py-2 align-top text-[#3e504c]">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function AttachmentChip({ item, onRemove }: { item: WorkspaceAttachment; onRemove: () => void }) {
  const Icon = item.type === 'image' ? ImageIcon : item.type === 'audio' ? AudioLines : item.type === 'video' ? Video : FileText;
  const screening = screeningSummary(item.analysis);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[#d9d6ca] bg-[#faf8f1] px-2.5 py-2" data-testid={`attachment-${item.localId}`}>
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${accentFor(item.type)}`}><Icon size={14} /></span>
      <div className="min-w-0">
        <p className="max-w-[150px] truncate text-[11px] font-semibold text-[#435452]">{item.name}</p>
        <p className="mono text-[8px] uppercase tracking-[0.12em] text-[#8a8d83]">
          {item.status === 'analyzing' ? 'reading…' : screening ? `${Math.round(screening.probability * 100)}% · ${classificationLabel(screening.classification)}` : item.status === 'complete' ? 'ready to ask' : formatKind(item.type)}
        </p>
      </div>
      {item.status === 'analyzing' && <Loader2 size={13} className="ml-auto animate-spin text-[#578d7e]" />}
      <button type="button" onClick={onRemove} className="ml-auto rounded-md p-1 text-[#9b9e95] hover:bg-[#eee9dd] hover:text-[#5f6863]" aria-label={`Remove ${item.name}`} data-testid={`button-remove-attachment-${item.localId}`}><X size={13} /></button>
    </div>
  );
}

function AttachmentMenu({ onPick }: { onPick: (kind: AttachmentKind) => void }) {
  return (
    <div className="absolute bottom-[calc(100%+10px)] left-0 z-20 w-[190px] rounded-2xl border border-[#d9d6ca] bg-[#fbf9f2] p-2 shadow-[0_14px_35px_rgba(30,60,52,.12)]">
      <p className="mono px-2 py-1 text-[8px] uppercase tracking-[0.16em] text-[#8b8d84]">Add context</p>
      {([
        ['image', ImageIcon, 'Image'],
        ['document', FileText, 'PDF'],
      ] as const).map(([kind, Icon, label]) => (
        <button key={kind} type="button" onClick={() => onPick(kind)} className="flex w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left text-[11px] font-medium text-[#3e504c] hover:bg-[#eef2e8]" data-testid={`button-pick-${kind}`}>
          <Icon size={14} className={kind === 'image' ? 'text-[#b46155]' : 'text-[#8b6f35]'} />
          {label}
          <ChevronRight size={13} className="ml-auto text-[#9ca19a]" />
        </button>
      ))}
    </div>
  );
}

function Composer({
  language,
  response,
  onResponse,
}: {
  language: Language;
  response: AssistantResponse | undefined;
  onResponse: (result: AssistantResponse | undefined) => void;
}) {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<WorkspaceAttachment[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const kindRef = useRef<AttachmentKind>('image');
  const analyzeImage = useAnalyzeImage();
  const analyzeDocument = useAnalyzeDocument();
  const analyzeAudio = useAnalyzeAudio();
  const analyzeVideo = useAnalyzeVideo();
  const chat = useChat();

  const onPick = (kind: AttachmentKind) => {
    kindRef.current = kind;
    setMenuOpen(false);
    if (fileRef.current) {
       fileRef.current.accept = kind === 'image' ? 'image/*' : kind === 'audio' ? 'audio/*' : kind === 'video' ? 'video/*' : '.pdf,application/pdf';
      fileRef.current.click();
    }
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const kind = kindRef.current;
    const localId = `${kind}-${Date.now()}`;
    const pending: WorkspaceAttachment = { localId, type: kind, name: file.name, file, status: 'analyzing', observations: [] };
    setAttachments((current) => [...current, pending]);
    const done = (analysis: AnalysisResponse) => {
      setAttachments((current) => current.map((item) => item.localId === localId ? { ...item, status: 'complete', extracted_text: analysis.text, observations: analysis.observations, analysis } : item));
    };
    const fail = () => setAttachments((current) => current.map((item) => item.localId === localId ? { ...item, status: 'error' } : item));
    if (kind === 'image') analyzeImage.mutate({ data: { file } }, { onSuccess: done, onError: fail });
    if (kind === 'document') analyzeDocument.mutate({ data: { file } }, { onSuccess: done, onError: fail });
    if (kind === 'audio') analyzeAudio.mutate({ data: { file } }, { onSuccess: done, onError: fail });
    if (kind === 'video') analyzeVideo.mutate({ data: { file } }, { onSuccess: done, onError: fail });
    event.target.value = '';
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim() || chat.isPending || attachments.some((item) => item.status === 'analyzing')) return;
    const body = {
      message: message.trim(),
      language,
      conversation_id: response?.request_id ?? null,
      research_mode: false,
      attachments: attachments.map(({ type, name, extracted_text, observations }) => ({ type, name, extracted_text, observations })),
    };
    chat.mutate({ data: body }, { onSuccess: (result) => { onResponse(result); setMessage(''); } });
  };

  const suggestion = (text: string) => setMessage(text);

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap gap-2">
        {attachments.map((item) => <AttachmentChip key={item.localId} item={item} onRemove={() => setAttachments((current) => current.filter((entry) => entry.localId !== item.localId))} />)}
      </div>
      <form onSubmit={submit} className="rounded-[22px] border border-[#d8d6ca] bg-[#fbf9f2] p-3 shadow-[0_10px_25px_rgba(44,69,61,.05)] focus-within:border-[#8db8a8] focus-within:shadow-[0_12px_28px_rgba(64,113,96,.11)]" data-testid="form-chat">
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} dir={language === 'ur' ? 'rtl' : 'ltr'} placeholder={language === 'ur' ? 'اپنا سوال یہاں لکھیں…' : 'Ask a clear question about Parkinson’s…'} rows={3} className="w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-6 text-[#304542] outline-none placeholder:text-[#9b9e93]" data-testid="input-chat-message" />
        <div className="mt-3 flex items-center justify-between border-t border-[#e5e1d6] pt-3">
          <div className="relative">
            <button type="button" onClick={() => setMenuOpen((open) => !open)} className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-[11px] font-semibold text-[#557067] hover:bg-[#edf1e9]" data-testid="button-add-context">
              <Paperclip size={15} />
              <span className="hidden sm:inline">Add context</span>
              <ChevronDown size={13} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>
            {menuOpen && <AttachmentMenu onPick={onPick} />}
          </div>
          <div className="flex items-center gap-3">
            {chat.isError && <span className="hidden text-[10px] text-[#ad5b4e] sm:inline">Couldn’t reach the desk. Try again.</span>}
            <button type="submit" disabled={!message.trim() || chat.isPending || attachments.some((item) => item.status === 'analyzing')} className="flex items-center gap-2 rounded-xl bg-[#28524c] px-4 py-2.5 text-[11px] font-semibold text-[#fbf8ed] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-send-message">
              {chat.isPending ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpRight size={14} />}
              {chat.isPending ? 'Thinking' : 'Ask Murmur'}
            </button>
          </div>
        </div>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {['What should I ask my neurologist?', 'Explain freezing of gait', 'Help me read this paper'].map((text) => (
          <button type="button" key={text} onClick={() => suggestion(text)} className="rounded-full border border-[#d9d7cc] px-3 py-1.5 text-[10px] text-[#6e7972] transition-colors hover:border-[#9cc2b3] hover:bg-[#f1f4ec] hover:text-[#315951]" data-testid={`button-suggestion-${text.slice(0, 5).replaceAll(' ', '-').toLowerCase()}`}>{text}</button>
        ))}
      </div>
      <input ref={fileRef} type="file" className="hidden" onChange={onFile} data-testid="input-file-attachment" />
    </div>
  );
}

function EmptyDesk({ language, onLanguageChange, onResponse }: { language: Language; onLanguageChange: (language: Language) => void; onResponse: (result: AssistantResponse | undefined) => void }) {
  return (
    <>
      <section className="relative overflow-hidden rounded-[28px] border border-[#d9d6c9] bg-[#eef2e7] px-6 py-8 md:px-10 md:py-11" data-testid="section-assistant-intro">
        <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full border-[1px] border-[#a6c6b5]/60 animate-drift" />
        <div className="absolute -right-2 -top-8 h-40 w-40 rounded-full border-[1px] border-[#a6c6b5]/40" />
        <div className="relative max-w-[680px]">
          <div className="mb-5 flex items-center gap-2 text-[#557e70]">
            <Sparkles size={16} />
            <span className="mono text-[9px] uppercase tracking-[0.18em]">An informational prototype</span>
          </div>
          <h2 className="serif max-w-[590px] text-[43px] leading-[.98] tracking-[-.03em] text-[#244542] md:text-[62px]">Bring a question.<br /><span className="text-[#b46155]">Leave with clarity.</span></h2>
          <p className="mt-6 max-w-[490px] text-[14px] leading-6 text-[#62736d]">Murmur gathers plain-language context from trusted Parkinson’s sources, then shows you how it got there.</p>
        </div>
        <div className="relative mt-8 max-w-[700px]">
          <Composer language={language} response={undefined} onResponse={onResponse} />
        </div>
      </section>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#ddd8cc] pb-5">
        <div className="flex items-center gap-2 text-[#7b827a]"><Info size={14} /><span className="text-[11px]">For information only — not a diagnosis or treatment system.</span></div>
        <div className="flex items-center gap-2 text-[11px] text-[#7b827a]">
          <span>Response language</span>
          <button type="button" onClick={() => onLanguageChange(language === 'en' ? 'ur' : 'en')} className="font-semibold text-[#315f57] underline decoration-[#9dc5b6] underline-offset-4" data-testid="button-toggle-response-language">{language === 'en' ? 'English' : 'اردو'}</button>
        </div>
      </div>
    </>
  );
}

function SourceCard({ source, index }: { source: Source; index: number }) {
  return (
    <a href={source.url} target="_blank" rel="noreferrer" className="group block rounded-2xl border border-[#ddd8cc] bg-[#fbf9f2] p-4 transition-transform hover:-translate-y-0.5 hover:border-[#a5c6b5]" data-testid={`card-source-${source.id}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="mono text-[9px] text-[#b46155]">0{index + 1}</span>
        <ArrowUpRight size={14} className="text-[#89938b] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
      <h4 className="mt-4 text-[13px] font-semibold leading-5 text-[#324b47]">{source.title}</h4>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] text-[#7c857e]">{source.publisher}</span>
        <span className="rounded-full bg-[#e5f0e8] px-2 py-1 mono text-[8px] text-[#39715d]">{source.source_quality}</span>
      </div>
      <p className="mt-3 border-t border-[#ece7db] pt-3 text-[10px] leading-4 text-[#7f8880]">{source.why_selected}</p>
    </a>
  );
}

function ResponseView({ result }: { result: AssistantResponse }) {
  const [traceOpen, setTraceOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const sourceMap = useMemo(() => new Map(result.sources.map((source) => [source.id, source])), [result.sources]);
  return (
    <section className="animate-reveal mt-7" data-testid="section-assistant-response">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#dcefeb] text-[#2d7067]"><Check size={15} /></span>
            <span className="mono text-[9px] uppercase tracking-[0.17em] text-[#5b8476]">Murmur’s read</span>
            <span className="ml-auto mono text-[9px] text-[#9a9b91]">request {result.request_id.slice(0, 8)}</span>
          </div>
          <article className="rounded-[24px] border border-[#d9d6ca] bg-[#fbf9f2] p-6 md:p-8" dir={result.language === 'ur' ? 'rtl' : 'ltr'}>
            <Markdown content={result.answer} />
            {result.extracted_content.length > 0 && (
              <div className="mt-6 border-t border-[#e6e1d5] pt-5">
                <p className="mono text-[9px] uppercase tracking-[0.17em] text-[#858a81]">Pulled from your attachments</p>
                <ul className="mt-3 space-y-2">{result.extracted_content.map((item, index) => <li key={index} className="flex gap-2 text-[12px] leading-5 text-[#6b7770]"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#d48870]" />{item}</li>)}</ul>
              </div>
            )}
          </article>
          <div className={`mt-4 rounded-2xl border p-4 ${result.safety.passed ? 'border-[#cfe0d2] bg-[#eef5ed]' : 'border-[#e1c9be] bg-[#fbede6]'}`} data-testid="notice-safety">
            <div className="flex items-start gap-3">
              <ShieldCheck size={17} className={result.safety.passed ? 'text-[#43856e]' : 'text-[#b46155]'} />
              <div><p className="text-[12px] font-semibold text-[#405550]">Safety check {result.safety.passed ? 'passed' : 'needs care'}</p><p className="mt-1 text-[11px] leading-5 text-[#6c7870]">{result.safety.disclaimer} This is an informational prototype, not a diagnosis or treatment system. Do not upload confidential medical information.</p></div>
            </div>
          </div>
          <div className="mt-7">
            <button type="button" onClick={() => setEvidenceOpen((open) => !open)} className="flex w-full items-center justify-between border-b border-[#ddd8cc] pb-3 text-left" data-testid="button-toggle-evidence">
              <span className="flex items-center gap-2"><ClipboardCheck size={15} className="text-[#b46155]" /><span className="text-[13px] font-semibold text-[#40534f]">Evidence trail <span className="ml-1 text-[#9a9d94]">({result.evidence.length})</span></span></span>
              <ChevronDown size={16} className={`text-[#89938b] transition-transform ${evidenceOpen ? 'rotate-180' : ''}`} />
            </button>
            {evidenceOpen && <div className="mt-4 space-y-3">{result.evidence.map((evidence) => <div key={evidence.id} className="rounded-xl border-l-2 border-[#9cc4b4] bg-[#f4f2ea] px-4 py-3" data-testid={`evidence-${evidence.id}`}><p className="text-[12px] leading-5 text-[#5b6962]">“{evidence.passage}”</p><div className="mt-2 flex items-center gap-3 mono text-[8px] uppercase tracking-[0.1em] text-[#8c9189]"><span>{sourceMap.get(evidence.source_id)?.publisher ?? evidence.source_id}</span><span>relevance {Math.round(evidence.relevance_score * 100)}%</span></div></div>)}</div>}
          </div>
        </div>
        <aside>
          <div className="mb-3 flex items-center justify-between"><p className="mono text-[9px] uppercase tracking-[0.18em] text-[#85867e]">Sources selected</p><span className="rounded-full bg-[#e5f0e8] px-2 py-1 mono text-[8px] text-[#39715d]">{result.sources.length} references</span></div>
          <div className="space-y-3">{result.sources.map((source, index) => <SourceCard key={source.id} source={source} index={index} />)}</div>
          <div className="mt-6 overflow-hidden rounded-2xl border border-[#d9d6ca] bg-[#f1eee4]">
            <button type="button" onClick={() => setTraceOpen((open) => !open)} className="flex w-full items-center justify-between px-4 py-3.5 text-left" data-testid="button-toggle-agent-trace"><span className="flex items-center gap-2 text-[11px] font-semibold text-[#52635d]"><Activity size={14} className="text-[#b46155]" />How Murmur worked</span><ChevronDown size={15} className={`text-[#8e9289] transition-transform ${traceOpen ? 'rotate-180' : ''}`} /></button>
            {traceOpen && <div className="border-t border-[#ddd8cc] px-4 py-2">{result.agent_trace.map((trace, index) => <div className="flex gap-3 border-b border-[#e0dbcf] py-3 last:border-b-0" key={`${trace.agent}-${index}`} data-testid={`trace-${index}`}><div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${trace.status === 'success' ? 'bg-[#6fae93]' : trace.status === 'warning' ? 'bg-[#d09a62]' : 'bg-[#bd7568]'}`} /><div><p className="text-[11px] font-semibold text-[#56655e]">{trace.label}</p><p className="mt-1 text-[10px] leading-4 text-[#818980]">{trace.summary}</p></div></div>)}</div>}
          </div>
        </aside>
      </div>
    </section>
  );
}

function AssistantPage() {
  const [result, setResult] = useState<AssistantResponse>();
  const [language, setLanguage] = useState<Language>('en');
  return (
    <Shell activeSection="assistant" language={language} onLanguageChange={setLanguage}>
      <main className="mx-auto max-w-[1180px] px-5 py-7 md:px-10 md:py-10">
        <div className="mb-7 flex items-end justify-between gap-5">
          <div><p className="mono text-[9px] uppercase tracking-[0.19em] text-[#b46155]">01 / open desk</p><h2 className="serif mt-2 text-[31px] leading-none text-[#284948] md:text-[38px]">A place to start.</h2></div>
          {result && <button type="button" onClick={() => setResult(undefined)} className="flex items-center gap-2 rounded-xl border border-[#d9d6ca] px-3 py-2 text-[10px] font-semibold text-[#617069] hover:bg-[#f5f1e7]" data-testid="button-new-question"><Plus size={14} /> New question</button>}
        </div>
        {!result ? <EmptyDesk language={language} onLanguageChange={setLanguage} onResponse={setResult} /> : <><Composer language={language} response={result} onResponse={setResult} /><ResponseView result={result} /></>}
        <CapabilitiesRail />
        <footer className="mt-12 border-t border-[#ddd8cc] py-6 text-[10px] leading-5 text-[#838a81]">
          <div className="flex flex-col justify-between gap-3 sm:flex-row"><span>Murmur is a research companion, not a medical professional.</span><span>Do not upload confidential medical information.</span></div>
        </footer>
      </main>
    </Shell>
  );
}

function ResearchPage() {
  const [question, setQuestion] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [result, setResult] = useState<AssistantResponse>();
  const research = useResearch();
  const examples = ['What changed in Parkinson’s exercise research after 2021?', 'Compare levodopa response measures across recent studies', 'Find patient-reported outcomes used in early-stage trials'];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim() || research.isPending) return;
    research.mutate({ data: { question: question.trim(), language } }, { onSuccess: (response) => setResult(response) });
  };
  return (
    <Shell activeSection="research" language={language} onLanguageChange={setLanguage}>
      <main className="mx-auto max-w-[1180px] px-5 py-7 md:px-10 md:py-10">
        <div className="mb-8 flex items-end justify-between gap-5">
          <div>
            <p className="mono text-[9px] uppercase tracking-[0.19em] text-[#b46155]">02 / literature desk</p>
            <h2 className="serif mt-3 max-w-[600px] text-[45px] leading-[.98] tracking-[-.025em] text-[#284948] md:text-[64px]">Follow the question<br /><span className="text-[#b46155]">to the source.</span></h2>
            <p className="mt-6 max-w-[520px] text-[14px] leading-6 text-[#718079]">Research mode keeps the conversation close to the literature: retrieval, source quality, and passages you can inspect.</p>
          </div>
          {result && <button type="button" onClick={() => setResult(undefined)} className="flex shrink-0 items-center gap-2 rounded-xl border border-[#d9d6ca] px-3 py-2 text-[10px] font-semibold text-[#617069] hover:bg-[#f5f1e7]" data-testid="button-new-research"><Plus size={14} /> New question</button>}
        </div>
        {!result ? (
          <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
            <section>
              <form onSubmit={submit} className="rounded-[23px] border border-[#d8d6ca] bg-[#fbf9f2] p-4 shadow-[0_10px_25px_rgba(44,69,61,.05)]" data-testid="form-research">
                <div className="flex items-center gap-2 border-b border-[#e5e1d6] pb-3 text-[#6b8379]"><Search size={16} /><span className="mono text-[9px] uppercase tracking-[0.15em]">Literature question</span><span className="ml-auto rounded-full bg-[#e7f0e8] px-2 py-1 mono text-[8px] text-[#39715d]">source-aware</span></div>
                <textarea value={question} onChange={(event) => setQuestion(event.target.value)} dir={language === 'ur' ? 'rtl' : 'ltr'} rows={5} placeholder="Ask about a finding, measure, intervention, or paper…" className="w-full resize-none bg-transparent py-4 text-[15px] leading-6 text-[#304542] outline-none placeholder:text-[#9b9e93]" data-testid="input-research-question" />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e1d6] pt-3"><div className="flex items-center gap-2 text-[10px] text-[#818b83]"><FlaskConical size={14} className="text-[#b46155]" />Retrieves and compares available evidence</div><button type="submit" disabled={!question.trim() || research.isPending} className="flex items-center gap-2 rounded-xl bg-[#28524c] px-4 py-2.5 text-[11px] font-semibold text-[#fbf8ed] disabled:opacity-40" data-testid="button-submit-research">{research.isPending ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}{research.isPending ? 'Searching' : 'Search the field'}</button></div>
              </form>
              {research.isError && <div className="mt-4 flex items-center justify-between rounded-xl border border-[#e3c9be] bg-[#fbede6] px-4 py-3 text-[11px] text-[#92584c]" data-testid="status-research-error"><span>Research mode could not complete this search.</span><button type="button" onClick={submit} className="font-semibold underline" data-testid="button-retry-research">Try again</button></div>}
              <div className="mt-4 flex flex-wrap gap-2">{examples.map((example) => <button key={example} type="button" onClick={() => setQuestion(example)} className="rounded-full border border-[#d9d7cc] px-3 py-1.5 text-left text-[10px] text-[#6e7972] hover:border-[#9cc2b3] hover:bg-[#f1f4ec]" data-testid={`button-research-example-${example.slice(0, 4)}`}>{example}</button>)}</div>
            </section>
            <aside className="lg:pt-[120px]">
              <div className="paper-grid rounded-[22px] border border-[#d9d6ca] bg-[#f7f3e8] p-5" data-testid="card-research-notes"><div className="flex items-center gap-2 text-[#3d7065]"><Layers3 size={16} /><span className="mono text-[9px] uppercase tracking-[0.16em]">Research notes</span></div><div className="mt-5 space-y-5"><div><p className="text-[12px] font-semibold text-[#465952]">Ask for comparison</p><p className="mt-1.5 text-[11px] leading-5 text-[#7c857e]">Name two interventions, time periods, or measures to make the retrieval more useful.</p></div><div><p className="text-[12px] font-semibold text-[#465952]">Inspect the passage</p><p className="mt-1.5 text-[11px] leading-5 text-[#7c857e]">Every response keeps selected evidence close, so you can read the source in context.</p></div><div><p className="text-[12px] font-semibold text-[#465952]">Mind the boundary</p><p className="mt-1.5 text-[11px] leading-5 text-[#7c857e]">Research summaries are informational and should not be used for diagnosis or treatment decisions.</p></div></div></div>
              <div className="mt-4 rounded-[22px] border border-[#d9d6ca] bg-[#fbf9f2] p-5"><div className="flex items-center gap-2"><CircleHelp size={15} className="text-[#b46155]" /><span className="text-[12px] font-semibold text-[#52625c]">Language</span></div><div className="mt-4 flex gap-2"><button type="button" onClick={() => setLanguage('en')} className={`flex-1 rounded-xl border px-3 py-2 text-[11px] ${language === 'en' ? 'border-[#77a895] bg-[#e5f0e8] text-[#315f57]' : 'border-[#ded9cc] text-[#7f8780]'}`} data-testid="button-research-language-en">English</button><button type="button" onClick={() => setLanguage('ur')} className={`flex-1 rounded-xl border px-3 py-2 text-[11px] ${language === 'ur' ? 'border-[#77a895] bg-[#e5f0e8] text-[#315f57]' : 'border-[#ded9cc] text-[#7f8780]'}`} data-testid="button-research-language-ur">اردو</button></div></div>
            </aside>
          </div>
        ) : (
          <ResponseView result={result} />
        )}
        <footer className="mt-12 border-t border-[#ddd8cc] py-6 text-[10px] leading-5 text-[#838a81]"><div className="flex flex-col justify-between gap-3 sm:flex-row"><span>Evidence is a starting point for careful reading.</span><span>Informational prototype. Not a diagnosis or treatment system.</span></div></footer>
      </main>
    </Shell>
  );
}

function ScoreBar({ probability, classification }: { probability: number; classification: string }) {
  const pct = Math.round(probability * 100);
  const barColor = classification === 'higher_screening_signal' ? 'bg-[#b46155]' : classification === 'intermediate_screening_signal' ? 'bg-[#c99a4e]' : 'bg-[#4f9c82]';
  return (
    <div data-testid="score-bar">
      <div className="flex items-center justify-between text-[11px] font-semibold text-[#40534f]">
        <span>Model screening score</span>
        <span>{pct}%</span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#e5e1d4]">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`mt-2 inline-block rounded-full px-2.5 py-1 mono text-[8px] uppercase tracking-[0.12em] ${classificationColor(classification)}`}>{classificationLabel(classification)}</span>
    </div>
  );
}

function FeatureTable({ features }: { features: Record<string, unknown> }) {
  const entries = Object.entries(features).filter(([, value]) => typeof value === 'number');
  if (!entries.length) return null;
  return (
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3" data-testid="feature-table">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-lg border border-[#e5e1d5] bg-[#f8f5ec] px-2.5 py-2">
          <p className="mono truncate text-[8px] uppercase tracking-[0.1em] text-[#8a8d83]" title={key}>{key.replace(/_/g, ' ')}</p>
          <p className="mt-0.5 text-[12px] font-semibold text-[#3d4c48]">{typeof value === 'number' ? Number(value.toFixed(3)) : String(value)}</p>
        </div>
      ))}
    </div>
  );
}

function ShapExplanation({ shapExplanation }: { shapExplanation: unknown }) {
  const explanation = shapExplanation as
    | { top_contributions?: Array<{ feature: string; value: number; shap_value: number; direction: string }>; note?: string }
    | null
    | undefined;
  if (!explanation?.top_contributions?.length) return null;
  const maxAbs = Math.max(...explanation.top_contributions.map((c) => Math.abs(c.shap_value)), 0.0001);
  return (
    <div className="mt-4 border-t border-[#e6e1d5] pt-4" data-testid="shap-explanation">
      <p className="mono mb-2 text-[9px] uppercase tracking-[0.14em] text-[#8a8d83]">Why this score — top contributing features</p>
      <div className="space-y-1.5">
        {explanation.top_contributions.map((c) => {
          const pct = (Math.abs(c.shap_value) / maxAbs) * 100;
          const increased = c.direction === "increased_score";
          return (
            <div key={c.feature} className="flex items-center gap-2 text-[11px]">
              <span className="w-[124px] shrink-0 truncate text-[#5c6863]" title={c.feature}>{c.feature.replace(/_/g, ' ')}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e9e5d8]">
                <div
                  className={`h-full rounded-full ${increased ? 'bg-[#b46155]' : 'bg-[#4f9c82]'}`}
                  style={{ width: `${Math.max(pct, 4)}%` }}
                />
              </div>
              <span className={`w-[92px] shrink-0 text-[10px] ${increased ? 'text-[#a6534a]' : 'text-[#36725e]'}`}>
                {increased ? '\u2191 increased' : '\u2193 decreased'}
              </span>
            </div>
          );
        })}
      </div>
      {explanation.note && <p className="mt-2.5 text-[10px] leading-4 text-[#8a8d83]">{explanation.note}</p>}
    </div>
  );
}

function ModalityResultCard({ title, icon, analysis }: { title: string; icon: ReactNode; analysis?: AnalysisResponse }) {
  if (!analysis) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d9d6ca] bg-[#f8f5ec] p-5 text-center text-[11px] text-[#8a8d83]" data-testid={`modality-empty-${title.toLowerCase()}`}>
        No {title.toLowerCase()} sample provided.
      </div>
    );
  }
  const screening = screeningSummary(analysis);
  const rawFeatures = (analysis.features?.acoustic_features ?? analysis.features?.gait_features) as Record<string, unknown> | undefined;
  return (
    <div className="rounded-2xl border border-[#d9d6ca] bg-[#fbf9f2] p-5" data-testid={`modality-card-${title.toLowerCase()}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e5f0e8] text-[#36725e]">{icon}</span>
        <span className="text-[13px] font-semibold text-[#324b47]">{title}</span>
      </div>
      {screening ? (
        <>
          <ScoreBar probability={screening.probability} classification={screening.classification} />
          {rawFeatures && <FeatureTable features={rawFeatures} />}
          <ShapExplanation shapExplanation={analysis.features?.shap_explanation} />
        </>
      ) : (
        <p className="rounded-xl bg-[#f3efe2] px-3 py-3 text-[11px] leading-5 text-[#7f8880]" data-testid={`modality-status-${title.toLowerCase()}`}>
          {analysis.status === 'error' ? 'Analysis failed.' : 'No screening score is available for this sample yet — see the note below.'}
        </p>
      )}
      {analysis.warnings.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-[#e6e1d5] pt-3">
          {analysis.warnings.map((warning, index) => (
            <li key={index} className="flex gap-2 text-[10px] leading-4 text-[#8a8d83]">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#c9a06d]" />
              {warning}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScreeningFilePicker({
  label,
  icon,
  accept,
  file,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-2xl border border-[#d8d6ca] bg-[#fbf9f2] p-5" data-testid={`picker-${label.toLowerCase()}`}>
      <div className="flex items-center gap-2 text-[#557067]">
        {icon}
        <span className="mono text-[9px] uppercase tracking-[0.15em]">{label}</span>
      </div>
      {file ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#d9d6ca] bg-[#f8f5ec] px-3 py-2.5">
          <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#3e504c]">{file.name}</p>
          <button type="button" onClick={() => onChange(null)} className="rounded-md p-1 text-[#9b9e95] hover:bg-[#eee9dd] hover:text-[#5f6863]" aria-label={`Remove ${label.toLowerCase()}`} data-testid={`button-remove-${label.toLowerCase()}`}>
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#c8c3b3] bg-[#f8f5ec] px-4 py-8 text-[11px] font-medium text-[#7f8880] transition-colors hover:border-[#9cc2b3] hover:bg-[#f1f4ec] hover:text-[#315951]"
          data-testid={`button-choose-${label.toLowerCase()}`}
        >
          <Paperclip size={16} />
          Choose a {label.toLowerCase()} file
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        data-testid={`input-${label.toLowerCase()}`}
      />
    </div>
  );
}

function ScreeningPage() {
  const [language, setLanguage] = useState<Language>('en');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [result, setResult] = useState<ScreenResult>();
  const screen = useScreen();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if ((!audioFile && !videoFile) || screen.isPending) return;
    screen.mutate(
      { data: { audio: audioFile ?? undefined, video: videoFile ?? undefined, language } },
      { onSuccess: (response) => setResult(response) },
    );
  };

  const reset = () => {
    setAudioFile(null);
    setVideoFile(null);
    setResult(undefined);
  };

  return (
    <Shell activeSection="screening" language={language} onLanguageChange={setLanguage}>
      <main className="mx-auto max-w-[1180px] px-5 py-7 md:px-10 md:py-10">
        <div className="mb-7 flex items-end justify-between gap-5">
          <div>
            <p className="mono text-[9px] uppercase tracking-[0.19em] text-[#b46155]">03 / screening desk</p>
            <h2 className="serif mt-2 text-[31px] leading-none text-[#284948] md:text-[38px]">Speech and gait screening.</h2>
          </div>
          {result && (
            <button type="button" onClick={reset} className="flex items-center gap-2 rounded-xl border border-[#d9d6ca] px-3 py-2 text-[10px] font-semibold text-[#617069] hover:bg-[#f5f1e7]" data-testid="button-new-screening">
              <Plus size={14} /> New screening
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-[#e1c9be] bg-[#fbede6] p-4" data-testid="notice-screening-disclaimer">
          <div className="flex items-start gap-3">
            <Info size={16} className="mt-0.5 shrink-0 text-[#b46155]" />
            <p className="text-[11px] leading-5 text-[#7a4a3f]">
              This is an experimental AI screening tool and is <strong>not a medical diagnosis</strong>. Speech and gait
              analysis can be affected by many factors unrelated to Parkinson's disease. Please consult a qualified
              healthcare professional for clinical evaluation. Do not upload identifiable or confidential medical
              information.
            </p>
          </div>
        </div>

        {!result ? (
          <form onSubmit={submit} className="mt-6" data-testid="form-screening">
            <div className="grid gap-4 sm:grid-cols-2">
              <ScreeningFilePicker label="Audio" icon={<Mic size={15} />} accept="audio/*" file={audioFile} onChange={setAudioFile} />
              <ScreeningFilePicker label="Video" icon={<Footprints size={15} />} accept="video/*" file={videoFile} onChange={setVideoFile} />
            </div>
            <p className="mt-4 text-[11px] leading-5 text-[#7a817a]">
              Provide a speech sample, a walking video, or both. Recording tips — speech: a few seconds of steady
              vowel phonation in a quiet room. Video: full body visible, camera stationary, several natural walking
              steps, well-lit.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="submit"
                disabled={(!audioFile && !videoFile) || screen.isPending}
                className="flex items-center gap-2 rounded-xl bg-[#28524c] px-4 py-2.5 text-[11px] font-semibold text-[#fbf8ed] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="button-run-screening"
              >
                {screen.isPending ? <Loader2 size={14} className="animate-spin" /> : <Gauge size={14} />}
                {screen.isPending ? 'Analyzing' : 'Run screening'}
              </button>
              {screen.isError && <span className="text-[10px] text-[#ad5b4e]">Couldn't reach the screening service. Try again.</span>}
            </div>
          </form>
        ) : (
          <div className="mt-6" data-testid="section-screening-result">
            {result.combined_score != null && result.modalities_used.length > 1 && (
              <div className="mb-5 rounded-2xl border border-[#d9d6ca] bg-[#eef2e7] p-6" data-testid="card-combined-score">
                <div className="flex items-center gap-2 text-[#557e70]">
                  <HeartPulse size={16} />
                  <span className="mono text-[9px] uppercase tracking-[0.18em]">Combined multimodal score</span>
                </div>
                <div className="mt-4 max-w-md">
                  <ScoreBar probability={result.combined_score} classification={result.combined_label ?? 'lower_screening_signal'} />
                </div>
                <p className="mt-3 text-[10px] leading-4 text-[#6c756e]">
                  Weighted average of the speech ({Math.round(result.speech_weight * 100)}%) and gait (
                  {Math.round(result.gait_weight * 100)}%) scores. Weights are configurable and are not claimed to be
                  clinically optimal.
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <ModalityResultCard title="Speech" icon={<Mic size={15} />} analysis={result.speech} />
              <ModalityResultCard title="Gait" icon={<Footprints size={15} />} analysis={result.gait} />
            </div>
            <div className="mt-5 rounded-2xl border border-[#d9d6ca] bg-[#fbf9f2] p-6" data-testid="card-care-plan">
              <div className="mb-3 flex items-center gap-2 text-[#557e70]">
                <ClipboardCheck size={16} />
                <span className="mono text-[9px] uppercase tracking-[0.18em]">Explanation &amp; next steps</span>
              </div>
              {result.care_plan_available && result.care_plan ? (
                <>
                  <Markdown content={result.care_plan} />
                  {result.care_plan_sources && result.care_plan_sources.length > 0 && (
                    <div className="mt-4 border-t border-[#e6e1d5] pt-3">
                      <p className="mono mb-2 text-[8px] uppercase tracking-[0.12em] text-[#8a8d83]">Sources</p>
                      <ul className="space-y-1">
                        {result.care_plan_sources.map((source) => (
                          <li key={source.id} className="text-[10px] leading-4">
                            <a href={source.url} target="_blank" rel="noreferrer" className="text-[#b46155] underline decoration-[#e2b6a6] underline-offset-2 hover:text-[#93493f]">
                              [{source.id}] {source.title}
                            </a>
                            <span className="text-[#8a8d83]"> — {source.publisher}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="rounded-xl bg-[#f3efe2] px-3 py-3 text-[11px] leading-5 text-[#7f8880]" data-testid="care-plan-unavailable">
                  {result.care_plan_warning ?? 'An AI-written explanation is not available for this result.'}
                </p>
              )}
            </div>
            <p className="mt-5 text-[10px] leading-5 text-[#838a81]">{result.disclaimer}</p>
          </div>
        )}

        <footer className="mt-12 border-t border-[#ddd8cc] py-6 text-[10px] leading-5 text-[#838a81]">
          <div className="flex flex-col justify-between gap-3 sm:flex-row">
            <span>Screening scores are experimental research outputs, not clinical probabilities.</span>
            <span>Do not upload confidential medical information.</span>
          </div>
        </footer>
      </main>
    </Shell>
  );
}

function Shell({ children, activeSection, language, onLanguageChange }: { children: ReactNode; activeSection: 'assistant' | 'research' | 'screening'; language: Language; onLanguageChange: (language: Language) => void }) {
  return <div className="grain flex min-h-[100dvh] bg-[#f4f1e8] text-[#304542]"><Sidebar activeSection={activeSection} /><div className="min-w-0 flex-1"><TopBar activeSection={activeSection} language={language} onLanguageChange={onLanguageChange} />{children}</div></div>;
}

function Router() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={AssistantPage} />
        <Route path="/research" component={ResearchPage} />
        <Route path="/screening" component={ScreeningPage} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;