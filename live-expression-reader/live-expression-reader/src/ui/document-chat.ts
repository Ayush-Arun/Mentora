// Professional AI Document Reader & Adaptive Chat Controller
// Enables file/PDF insertion, real-time gaze reading, facial confusion detection,
// adaptive document re-creation via Gemma, and interactive AI chat.

import { GemmaService, type ExpressionContext } from "../ai/gemma-service";
import type { GazeResult } from "../gaze-tracker";

const SAMPLE_DOCUMENTS = [
  {
    title: "Quantum Entanglement & Non-Locality in Modern Physics",
    text: `Quantum entanglement is a fundamental physical phenomenon occurring when a group of particles interact in ways such that the quantum state of each particle of the pair or group cannot be described independently of the state of the others, even when the particles are separated by a large distance.

Mathematically, consider a bipartite quantum state living in a composite Hilbert space H_A ⊗ H_B. A state vector |Ψ⟩ is entangled if and only if it cannot be factorized into a simple tensor product |ψ⟩_A ⊗ |φ⟩_B of subsystem states.

The most famous exemplar is the Bell state (|00⟩ + |11⟩) / √2. When subsystem A undergoes a projective measurement in the computational Z-basis yielding outcome 0, the post-measurement state instantly collapses subsystem B into state 0, regardless of spacelike separation.

Albert Einstein famously referred to this consequence as "spooky action at a distance" (spukhafte Fernwirkung) in the 1935 EPR paradox paper with Podolsky and Rosen, asserting that quantum mechanics must either violate relativistic locality or be fundamentally incomplete without hidden local variables.

In 1964, John Stewart Bell formulated Bell's Theorem, demonstrating that no local hidden-variable theory can reproduce all quantum mechanical correlations, established via the Clauser-Horne-Shimony-Holt (CHSH) inequality |⟨AB⟩ - ⟨AB'⟩ + ⟨A'B⟩ + ⟨A'B'⟩| ≤ 2. Experimental violations confirm that quantum non-locality is an irreducible property of our physical universe.`,
  },
  {
    title: "Transformer Architecture & Multi-Head Self-Attention",
    text: `The Transformer architecture, introduced in 'Attention Is All You Need' (Vaswani et al., 2017), relies entirely on self-attention mechanisms to compute representations of input sequences without using recurrent or convolutional neural networks.

Given an input matrix X ∈ ℝ^(N×d_model), linear projection matrices W_Q, W_K, W_V project the embeddings into Query (Q), Key (K), and Value (V) spaces of dimension d_k.

Scaled Dot-Product Attention is formalized as:
Attention(Q, K, V) = softmax( (Q K^T) / √d_k ) V

The scaling factor 1/√d_k counteracts the effect of large inner-product magnitudes pushing softmax into regions of vanishingly small gradients. 

Multi-Head Attention extends this formulation by projecting queries, keys, and values h times with distinct learned parameter matrices:
MultiHead(Q,K,V) = Concat(head_1, ..., head_h) W_O
where each head_i = Attention(Q W_i^Q, K W_i^K, V W_i^V).

Each multi-head layer is followed by layer normalization, residual skip connections, and a position-wise feed-forward network consisting of two affine transformations with a non-linear activation function like ReLU or GeLU.`,
  },
  {
    title: "Neurobiology of Cognitive Load & Working Memory",
    text: `Human working memory represents a limited-capacity cognitive system responsible for transient holding, processing, and manipulating of information essential for complex cognitive activities like reading, reasoning, and comprehension.

According to Baddeley and Hitch's multicomponent model, working memory comprises the central executive, the phonological loop, the visuospatial sketchpad, and the episodic buffer. 

Cognitive Load Theory (Sweller, 1988) categorizes cognitive effort into three distinct forms:
1. Intrinsic Load: the inherent conceptual difficulty of the instructional material, dictated by element interactivity.
2. Extraneous Load: mental effort wasted due to poor instructional design or ambiguous presentation formats.
3. Germane Load: dedicated mental effort directed toward constructing schemas and mental models.

When instructional texts impose excessive extraneous load, the prefrontal cortex experiences cognitive exhaustion, measurable via pupil dilation (pupillometry), elevated blink rates, and micro-contractions of the corrugator supercilii muscle (FACS Action Unit 4, brow lowering).`,
  },
];

export class DocumentChatController {
  private gemmaService: GemmaService;
  private currentDocText = "";
  private currentDocTitle = "";
  private activeParagraphIndex = -1;
  private currentTab: "reader" | "adapted" | "chat" | "settings" = "reader";

  public getDocumentTitle(): string {
    return this.currentDocTitle;
  }

  public getCurrentTab(): string {
    return this.currentTab;
  }
  private latestContext: ExpressionContext = {
    topEmotion: "neutral",
    emotionConfidence: 0.8,
    cognitiveState: "focused",
    confusionScore: 0.05,
    stressedScore: 0.1,
    focusedScore: 0.8,
    valence: 0,
    arousal: 0,
    activeMuscles: [],
  };

  private chatHistory: { role: string; content: string; time: string; stateTag?: string }[] = [];

  constructor() {
    this.gemmaService = new GemmaService();
    this.setupUI();
    this.loadSample(0);
  }

  private setupUI(): void {
    // Tab switching
    const tabReader = document.getElementById("tab-btn-reader");
    const tabAdapted = document.getElementById("tab-btn-adapted");
    const tabChat = document.getElementById("tab-btn-chat");
    const tabSettings = document.getElementById("tab-btn-settings");

    tabReader?.addEventListener("click", () => this.switchTab("reader"));
    tabAdapted?.addEventListener("click", () => this.switchTab("adapted"));
    tabChat?.addEventListener("click", () => this.switchTab("chat"));
    tabSettings?.addEventListener("click", () => this.switchTab("settings"));

    // File Upload handling
    const fileInput = document.getElementById("doc-file-input") as HTMLInputElement | null;
    const uploadBtn = document.getElementById("doc-upload-btn");
    uploadBtn?.addEventListener("click", () => fileInput?.click());

    fileInput?.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.handleFileUpload(file);
    });

    // Sample picker
    const sampleBtn = document.getElementById("doc-sample-btn");
    let sampleIdx = 0;
    sampleBtn?.addEventListener("click", () => {
      sampleIdx = (sampleIdx + 1) % SAMPLE_DOCUMENTS.length;
      this.loadSample(sampleIdx);
    });

    // Re-create with Gemma Button
    const recreateBtn = document.getElementById("doc-recreate-btn");
    recreateBtn?.addEventListener("click", () => this.triggerDocumentRecreation());

    const recreateBannerBtn = document.getElementById("doc-recreate-banner-btn");
    recreateBannerBtn?.addEventListener("click", () => this.triggerDocumentRecreation());

    // Chat form submit
    const chatForm = document.getElementById("ai-chat-form");
    const chatInput = document.getElementById("ai-chat-input") as HTMLInputElement | null;
    chatForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      const query = chatInput?.value.trim();
      if (query) {
        if (chatInput) chatInput.value = "";
        this.sendChatMessage(query);
      }
    });

    // Quick prompt chips
    const chipBtns = document.querySelectorAll("[data-quick-prompt]");
    chipBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const prompt = btn.getAttribute("data-quick-prompt");
        if (prompt) this.sendChatMessage(prompt);
      });
    });

    // Gemma Settings
    const endpointInput = document.getElementById("gemma-endpoint-input") as HTMLInputElement | null;
    const modelInput = document.getElementById("gemma-model-input") as HTMLInputElement | null;
    const saveSettingsBtn = document.getElementById("gemma-save-settings");
    const testSettingsBtn = document.getElementById("gemma-test-conn");

    if (endpointInput && modelInput) {
      const cfg = this.gemmaService.getConfig();
      endpointInput.value = cfg.endpoint;
      modelInput.value = cfg.modelName;
    }

    saveSettingsBtn?.addEventListener("click", () => {
      const ep = endpointInput?.value.trim() || "http://localhost:11434";
      const model = modelInput?.value.trim() || "gemma";
      this.gemmaService.setConfig({ endpoint: ep, modelName: model });
      this.showToast("✓ Gemma configuration saved!");
    });

    testSettingsBtn?.addEventListener("click", async () => {
      const statusEl = document.getElementById("gemma-conn-status");
      if (statusEl) {
        statusEl.textContent = "Connecting to Gemma...";
        statusEl.className = "text-xs font-mono text-amber-400";
      }
      const res = await this.gemmaService.testConnection();
      if (statusEl) {
        statusEl.textContent = res.message;
        statusEl.className = `text-xs font-mono ${res.ok ? "text-emerald-400" : "text-rose-400"}`;
      }
    });

    // Initial greeting in chat
    this.addChatMessage("assistant", "Hello! I am your Gemma AI reading companion. As you read documents, I monitor your facial comprehension and cognitive states in real time. If any section causes confusion, ask me anything or click 'Re-Create with Gemma' to adapt the document!", undefined, "Ready");
  }

  public getReaderElement(): HTMLElement | null {
    return document.getElementById("doc-paragraphs-container");
  }

  private switchTab(tab: "reader" | "adapted" | "chat" | "settings"): void {
    this.currentTab = tab;
    const tabs = ["reader", "adapted", "chat", "settings"] as const;
    tabs.forEach((t) => {
      const btn = document.getElementById(`tab-btn-${t}`);
      const panel = document.getElementById(`panel-${t}`);
      if (t === tab) {
        btn?.classList.add("bg-indigo-600", "text-white", "shadow-md");
        btn?.classList.remove("text-neutral-400", "hover:bg-neutral-800");
        panel?.classList.remove("hidden");
      } else {
        btn?.classList.remove("bg-indigo-600", "text-white", "shadow-md");
        btn?.classList.add("text-neutral-400", "hover:bg-neutral-800");
        panel?.classList.add("hidden");
      }
    });
  }

  public loadSample(idx: number): void {
    const s = SAMPLE_DOCUMENTS[idx];
    if (!s) return;
    this.setDocument(s.title, s.text);
    this.showToast(`Loaded: "${s.title}"`);
  }

  public setDocument(title: string, text: string): void {
    this.currentDocTitle = title;
    this.currentDocText = text;

    const titleEl = document.getElementById("doc-title");
    if (titleEl) titleEl.textContent = title;

    const container = document.getElementById("doc-paragraphs-container");
    if (!container) return;

    container.innerHTML = "";
    const paragraphs = text.split("\n\n").filter((p) => p.trim().length > 0);

    paragraphs.forEach((p, idx) => {
      const pDiv = document.createElement("div");
      pDiv.setAttribute("data-doc-paragraph", String(idx));
      pDiv.className =
        "doc-para relative p-4 rounded-xl border border-neutral-800/80 bg-neutral-950/60 hover:bg-neutral-900/60 transition-all duration-200 leading-relaxed text-neutral-200 text-sm sm:text-base";

      const badge = document.createElement("div");
      badge.className = "flex items-center justify-between text-xs text-neutral-500 mb-1.5 font-mono select-none";
      badge.innerHTML = `<span>Section ${idx + 1}</span><span class="para-status text-neutral-600">Unread</span>`;

      const textBody = document.createElement("div");
      textBody.className = "select-text";
      textBody.textContent = p;

      pDiv.appendChild(badge);
      pDiv.appendChild(textBody);
      container.appendChild(pDiv);
    });

    const wordCount = text.trim().split(/\s+/).length;
    const countEl = document.getElementById("doc-word-count");
    if (countEl) countEl.textContent = `${wordCount} words`;

    // Clear adapted tab content to prompt new re-creation
    const adaptedContent = document.getElementById("adapted-doc-content");
    if (adaptedContent) {
      adaptedContent.innerHTML = `<div class="p-8 text-center text-neutral-400 text-sm">
        <p class="font-semibold text-neutral-200 mb-1">No adapted version generated yet for this document.</p>
        <p>As you read, Gemma monitors your facial expressions. Click <strong>"Re-Create with Gemma"</strong> anytime to adapt this document to your comprehension level.</p>
      </div>`;
    }
  }

  /**
   * Handle uploaded PDF or Text files
   */
  public async handleFileUpload(file: File): Promise<void> {
    this.showToast(`Loading "${file.name}"...`);
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith(".pdf")) {
      await this.parsePdfFile(file);
    } else {
      // Plain text / Markdown
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (text) {
          this.setDocument(file.name.replace(/\.[^/.]+$/, ""), text);
          this.showToast(`✓ Loaded "${file.name}"`);
        }
      };
      reader.readAsText(file);
    }
  }

  private async parsePdfFile(file: File): Promise<void> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsLib = (window as any).pdfjsLib;

      if (!pdfjsLib) {
        // Fallback: load pdfjs dynamically if needed
        this.showToast("Extracting PDF text content...");
      }

      if (pdfjsLib) {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(" ");
          fullText += `${pageText}\n\n`;
        }
        if (fullText.trim()) {
          this.setDocument(file.name.replace(/\.pdf$/i, ""), fullText);
          this.showToast(`✓ Parsed PDF: ${pdf.numPages} pages loaded`);
          return;
        }
      }

      // If PDF.js isn't ready, read raw text streams
      const rawText = new TextDecoder().decode(arrayBuffer);
      const extracted = rawText.match(/\(([^)]+)\)/g)?.map((s) => s.slice(1, -1)).join(" ") || "";
      if (extracted.length > 50) {
        this.setDocument(file.name, extracted);
      } else {
        this.showToast("Could not parse PDF text directly. Try converting to TXT/Markdown.");
      }
    } catch (err: any) {
      console.error(err);
      this.showToast(`PDF parsing error: ${err.message || "Unknown"}`);
    }
  }

  /**
   * Update real-time comprehension metrics based on facial expressions & gaze
   */
  public updateComprehension(
    gaze: GazeResult | null,
    expressionContext: ExpressionContext,
  ): void {
    this.latestContext = expressionContext;

    // 1. Calculate Comprehension Index
    // Confusion reduces score; focused / calm increases score
    const confusion = expressionContext.confusionScore;
    const stress = expressionContext.stressedScore;
    const focus = expressionContext.focusedScore;
    const isConfused = confusion > 0.35 || expressionContext.topEmotion === "confused";
    const isStressed = stress > 0.45;

    let score = Math.round(100 - confusion * 50 - stress * 30 + focus * 20);
    score = Math.max(10, Math.min(100, score));

    // Update Comprehension HUD Bar
    const scorePill = document.getElementById("hud-comp-score");
    const barEl = document.getElementById("hud-comp-bar");
    const statusEl = document.getElementById("hud-comp-status");
    const bannerEl = document.getElementById("doc-confusion-banner");

    if (scorePill) scorePill.textContent = `${score}%`;
    if (barEl) {
      barEl.style.width = `${score}%`;
      if (score < 45) {
        barEl.className = "h-full bg-rose-500 rounded-full transition-all duration-300";
      } else if (score < 70) {
        barEl.className = "h-full bg-amber-400 rounded-full transition-all duration-300";
      } else {
        barEl.className = "h-full bg-emerald-400 rounded-full transition-all duration-300";
      }
    }

    if (statusEl) {
      if (isConfused) {
        statusEl.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-rose-500 animate-ping mr-1.5"></span>Confused / High Effort (AU4 Furrow)`;
        statusEl.className = "font-bold text-rose-400 text-xs flex items-center";
      } else if (isStressed) {
        statusEl.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5"></span>Cognitive Overload`;
        statusEl.className = "font-bold text-amber-400 text-xs flex items-center";
      } else if (focus > 0.6) {
        statusEl.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1.5"></span>High Comprehension / Focused`;
        statusEl.className = "font-bold text-emerald-400 text-xs flex items-center";
      } else {
        statusEl.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-indigo-400 mr-1.5"></span>Reading Steady`;
        statusEl.className = "font-semibold text-indigo-300 text-xs flex items-center";
      }
    }

    // Show confusion alert banner if reader is repeatedly confused
    if (bannerEl) {
      if (isConfused || score < 42) {
        bannerEl.classList.remove("hidden");
      } else {
        bannerEl.classList.add("hidden");
      }
    }

    // 2. Gaze highlight on document paragraphs
    if (gaze && gaze.screenY > 0) {
      const container = document.getElementById("doc-paragraphs-container");
      if (container) {
        const paras = container.querySelectorAll<HTMLElement>("[data-doc-paragraph]");
        let bestIdx = -1;
        let minDist = Infinity;

        paras.forEach((p, idx) => {
          const rect = p.getBoundingClientRect();
          if (gaze.screenY >= rect.top && gaze.screenY <= rect.bottom) {
            bestIdx = idx;
          } else {
            const dist = Math.abs(gaze.screenY - (rect.top + rect.bottom) / 2);
            if (dist < minDist && dist < 120) {
              minDist = dist;
              bestIdx = idx;
            }
          }
        });

        if (bestIdx !== -1 && bestIdx !== this.activeParagraphIndex) {
          this.activeParagraphIndex = bestIdx;
          paras.forEach((p, idx) => {
            const statusSpan = p.querySelector(".para-status");
            if (idx === this.activeParagraphIndex) {
              p.classList.add(
                "border-indigo-500",
                "bg-indigo-600/15",
                "shadow-lg",
                "shadow-indigo-500/10",
                "ring-1",
                "ring-indigo-500/40",
              );
              if (statusSpan) {
                statusSpan.textContent = isConfused ? "⚠️ Confused" : "Active Focus";
                statusSpan.className = `para-status font-bold ${isConfused ? "text-rose-400" : "text-indigo-400"}`;
              }
            } else {
              p.classList.remove(
                "border-indigo-500",
                "bg-indigo-600/15",
                "shadow-lg",
                "shadow-indigo-500/10",
                "ring-1",
                "ring-indigo-500/40",
              );
            }
          });
        }
      }
    }
  }

  /**
   * Trigger Gemma adaptive document rewriting
   */
  public async triggerDocumentRecreation(promptAddition?: string): Promise<void> {
    if (!this.currentDocText.trim()) {
      this.showToast("Please upload or open a document first.");
      return;
    }

    this.switchTab("adapted");
    const container = document.getElementById("adapted-doc-content");
    if (container) {
      container.innerHTML = `
        <div class="p-8 text-center space-y-4">
          <div class="inline-flex p-3 rounded-full bg-indigo-600/20 border border-indigo-500/40 animate-pulse text-2xl">
            🧠
          </div>
          <h3 class="text-lg font-bold text-white">Gemma AI is Re-Creating the Document</h3>
          <p class="text-xs text-neutral-400 max-w-md mx-auto">
            Analyzing your facial micro-expressions (${this.latestContext.topEmotion}, confusion index ${(this.latestContext.confusionScore * 100).toFixed(0)}%) to tailor the text for maximum clarity...
          </p>
          <div class="w-48 h-1.5 bg-neutral-800 rounded-full mx-auto overflow-hidden">
            <div class="h-full bg-indigo-500 animate-pulse rounded-full" style="width: 75%"></div>
          </div>
        </div>
      `;
    }

    try {
      const recreated = await this.gemmaService.recreateDocument(
        this.currentDocText,
        this.latestContext,
        promptAddition,
      );

      if (container) {
        container.innerHTML = this.renderMarkdown(recreated);
      }
      this.showToast("✓ Document successfully re-created by Gemma!");
      this.addChatMessage("assistant", `I noticed ${this.latestContext.confusionScore > 0.35 ? "you were experiencing confusion" : "your cognitive reading signals"} on this text, so I restructured and simplified it in the **Adaptive Re-Created Doc** tab! Would you like me to explain any specific concept further?`, undefined, "Adapted");
    } catch (err: any) {
      if (container) {
        container.innerHTML = `<div class="p-6 text-rose-400 text-sm">Error generating document: ${err.message}</div>`;
      }
    }
  }

  /**
   * Send chat message to Gemma
   */
  public async sendChatMessage(query: string): Promise<void> {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    this.addChatMessage("user", query, time);
    this.switchTab("chat");

    // Add thinking placeholder
    const thinkingId = `thinking-${Date.now()}`;
    const chatContainer = document.getElementById("ai-chat-messages");
    if (chatContainer) {
      const placeholder = document.createElement("div");
      placeholder.id = thinkingId;
      placeholder.className = "flex items-start gap-3 p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-400 animate-pulse";
      placeholder.innerHTML = `<span>🧠</span><span>Gemma is reasoning with your facial state...</span>`;
      chatContainer.appendChild(placeholder);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    try {
      this.chatHistory.push({ role: "user", content: query, time });
      const reply = await this.gemmaService.chatWithDocument(
        this.chatHistory,
        this.currentDocText,
        this.latestContext,
      );

      const el = document.getElementById(thinkingId);
      if (el) el.remove();

      const replyTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      this.addChatMessage("assistant", reply, replyTime, `${this.latestContext.topEmotion} ${this.latestContext.cognitiveState}`);
    } catch (err: any) {
      const el = document.getElementById(thinkingId);
      if (el) el.remove();
      this.addChatMessage("assistant", `Could not connect to Gemma: ${err.message}. Please check Model Settings.`, time);
    }
  }

  private addChatMessage(role: "user" | "assistant", content: string, time?: string, stateTag?: string): void {
    const chatContainer = document.getElementById("ai-chat-messages");
    if (!chatContainer) return;

    const t = time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const isUser = role === "user";

    const msgDiv = document.createElement("div");
    msgDiv.className = `flex items-start gap-3 p-3.5 rounded-xl border ${
      isUser ? "bg-neutral-900/90 border-neutral-800 ml-8" : "bg-neutral-950 border-indigo-950/80 mr-8"
    }`;

    const icon = isUser ? "👤" : "🧠";
    const name = isUser ? "You" : "Gemma AI";

    msgDiv.innerHTML = `
      <div class="w-7 h-7 rounded-lg ${isUser ? "bg-neutral-800" : "bg-indigo-600/30 border border-indigo-500/40"} flex items-center justify-center shrink-0 text-sm">
        ${icon}
      </div>
      <div class="flex-1 space-y-1">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold text-white">${name}</span>
          <div class="flex items-center gap-2">
            ${stateTag ? `<span class="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 font-mono text-[10px] border border-indigo-500/20">${stateTag}</span>` : ""}
            <span class="text-neutral-500 font-mono text-[11px]">${t}</span>
          </div>
        </div>
        <div class="text-xs sm:text-sm text-neutral-200 leading-relaxed space-y-2">
          ${isUser ? content : this.renderMarkdown(content)}
        </div>
      </div>
    `;

    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  private renderMarkdown(md: string): string {
    // Simple fast markdown parser for headings, bold, bullet points, quotes
    let html = md
      .replace(/^# (.*$)/gim, '<h1 class="text-lg font-bold text-white mt-3 mb-1">$1</h1>')
      .replace(/^## (.*$)/gim, '<h2 class="text-base font-bold text-indigo-300 mt-3 mb-1">$1</h2>')
      .replace(/^### (.*$)/gim, '<h3 class="text-sm font-semibold text-neutral-100 mt-2 mb-1">$1</h3>')
      .replace(/^\> (.*$)/gim, '<blockquote class="border-l-2 border-indigo-500 pl-3 text-neutral-300 italic text-xs my-2">$1</blockquote>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong class="font-bold text-white">$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em class="italic text-neutral-300">$1</em>')
      .replace(/^• (.*$)/gim, '<li class="ml-4 list-disc text-neutral-300">$1</li>')
      .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc text-neutral-300">$1</li>')
      .replace(/\n\n/gim, '<br/><br/>');
    return html;
  }

  public showToast(msg: string): void {
    const toastEl = document.getElementById("notepad-toast");
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.remove("opacity-0", "translate-y-2");
    toastEl.classList.add("opacity-100", "translate-y-0");

    setTimeout(() => {
      toastEl.classList.remove("opacity-100", "translate-y-0");
      toastEl.classList.add("opacity-0", "translate-y-2");
    }, 2500);
  }
}
