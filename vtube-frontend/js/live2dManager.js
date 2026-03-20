/**
 * live2dManager.js — Live2D Cubism Web SDK integration
 *
 * Responsibilities:
 *   - Load and initialize a Live2D Cubism model (.model3.json)
 *   - Run the render loop (WebGL via the Cubism SDK's built-in renderer)
 *   - Expose a parameter setter used by EmotionController
 *
 * Setup steps (to activate from demo mode):
 *   1. Download Live2D Cubism SDK for Web:
 *      https://www.live2d.com/en/sdk/about/
 *   2. Place the following files from the SDK into frontend/lib/:
 *        live2dcubismcore.min.js   (Core SDK — binary, required)
 *        CubismSdkForWeb.js        (Framework — optional but recommended)
 *   3. Add your model files to frontend/models/your-model/:
 *        yourmodel.model3.json
 *        yourmodel.moc3
 *        textures/  (PNG texture atlas files)
 *        physics3.json (optional but recommended)
 *   4. Update LIVE2D_MODEL_PATH below to point to your model3.json
 *   5. In index.html, uncomment: <script src="lib/live2dcubismcore.min.js"></script>
 *   6. Change USE_DEMO_MODE to false in this file
 *
 * Without setup, the manager runs in DEMO_MODE — a simple canvas animation
 * driven by EmotionController._demoRender() that still exercises the full
 * expression pipeline without requiring a licensed model.
 *
 * Live2D licensing:
 *   - Free for non-commercial use with attribution
 *   - Commercial license required for revenue-generating products
 *   - See: https://www.live2d.com/en/terms/live2d-proprietary-software-license-agreement/
 */

// ── Configuration ───────────────────────────────────────────────────────────────
const USE_DEMO_MODE = true;  // set to false when SDK and model are in place
const LIVE2D_MODEL_PATH = './models/oshi/oshi.model3.json';

export class Live2DManager {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.model = null;          // CubismModel instance (null in demo mode)
    this.isLoaded = false;
  }

  /**
   * init — initializes the Live2D runtime and loads the model
   * @returns {Promise<CubismModel|null>}
   */
  async init() {
    if (USE_DEMO_MODE) {
      console.info('[Live2D] Demo mode — no model loaded. Set USE_DEMO_MODE=false to enable.');
      this._initDemoCanvas();
      this.isLoaded = true;
      return null;
    }

    // Check SDK is loaded
    if (typeof Live2DCubismCore === 'undefined') {
      console.error('[Live2D] live2dcubismcore.min.js not loaded. See setup instructions.');
      this._initDemoCanvas();
      return null;
    }

    try {
      this.model = await this._loadModel(LIVE2D_MODEL_PATH);
      this.isLoaded = true;
      console.info('[Live2D] Model loaded:', LIVE2D_MODEL_PATH);
      return this.model;
    } catch (err) {
      console.error('[Live2D] Failed to load model:', err);
      this._initDemoCanvas();
      return null;
    }
  }

  /**
   * getModel — returns the loaded Cubism model (or null in demo mode)
   */
  getModel() {
    return this.model;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  /**
   * _loadModel — loads a Live2D model from a model3.json path
   *
   * This is a simplified loader. The full Cubism Framework provides a more
   * complete implementation (CubismUserModel) with physics, pose, and motion.
   * For production, use the framework's AppDelegate pattern.
   */
  async _loadModel(modelPath) {
    const response = await fetch(modelPath);
    if (!response.ok) throw new Error(`Model fetch failed: ${response.status}`);

    const modelJson = await response.json();
    const basePath = modelPath.substring(0, modelPath.lastIndexOf('/') + 1);

    // Load .moc3 binary
    const mocPath = basePath + modelJson.FileReferences.Moc;
    const mocResponse = await fetch(mocPath);
    const mocBuffer = await mocResponse.arrayBuffer();

    // Create Cubism moc and model
    const moc = Live2DCubismCore.Moc.fromArrayBuffer(mocBuffer);
    if (!moc) throw new Error('Failed to create Moc from buffer');

    const model = Live2DCubismCore.Model.fromMoc(moc);
    if (!model) throw new Error('Failed to create Model from Moc');

    // Set up WebGL renderer via Cubism Framework (if available)
    // For the POC, we just return the raw model and apply params directly
    return model;
  }

  /**
   * _initDemoCanvas — draws a placeholder face on the canvas for demo mode
   */
  _initDemoCanvas() {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    const W = this.canvas.width, H = this.canvas.height;

    // Initial neutral face
    ctx.fillStyle = '#0d0d14';
    ctx.fillRect(0, 0, W, H);

    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 160, 0, Math.PI * 2);
    ctx.fillStyle = '#2a1f4a';
    ctx.fill();
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#a78bfa';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DEMO MODE', W / 2, H / 2 - 20);
    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.fillText('Load a Live2D model to see the real avatar', W / 2, H / 2 + 10);
  }
}
