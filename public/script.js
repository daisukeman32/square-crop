// Square Crop - メインスクリプト

class SquareCrop {
    constructor() {
        // DOM要素
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.folderInput = document.getElementById('folderInput');
        this.folderBtn = document.getElementById('folderBtn');
        this.editorWrapper = document.getElementById('editorWrapper');
        this.editor = document.getElementById('editor');
        this.canvas = document.getElementById('imageCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvasContainer = document.getElementById('canvasContainer');
        this.cropBox = document.getElementById('cropBox');
        this.thumbnailBar = document.getElementById('thumbnailBar');
        this.outputSettings = document.getElementById('outputSettings');
        this.sizePreset = document.getElementById('sizePreset');
        this.customSize = document.getElementById('customSize');
        this.sizeUnit = document.getElementById('sizeUnit');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.themeToggle = document.getElementById('themeToggle');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.confirmIndicator = document.getElementById('confirmIndicator');
        this.confirmedCountEl = document.getElementById('confirmedCount');
        this.totalCountEl = document.getElementById('totalCount');
        this.statsEl = document.getElementById('stats');
        this.currentPosEl = document.getElementById('currentPos');
        this.hintsKeys = document.querySelector('.hints-keys');

        // X用追加DOM要素
        this.modeToggle = document.getElementById('modeToggle');
        this.ratioSelector = document.getElementById('ratioSelector');
        this.ratioPreset = document.getElementById('ratioPreset');
        this.thumbGuide = document.getElementById('thumbGuide');

        // 状態
        this.images = []; // { file, img, cropData: { x, y, width, height }, confirmed: false, thumbUrl }
        this.currentIndex = 0;
        this.isDragging = false;
        this.isResizing = false;
        this.resizeHandle = null;
        this.dragStart = { x: 0, y: 0 };
        this.cropStart = { x: 0, y: 0, width: 0, height: 0 };
        this.scale = 1;
        this.isDialogOpen = false; // ダイアログ二重防止フラグ

        // モード管理
        this.currentMode = 'pixiv'; // 'pixiv' or 'x'
        this.currentRatio = { w: 9, h: 16 }; // X用デフォルト比率

        // キーコンフィグ（デフォルト値）
        this.keyConfig = {
            prev: 'a',
            next: 'd',
            confirm: 's'
        };

        this.init();
    }

    init() {
        this.loadKeyConfig();
        this.setupDropZone();
        this.setupCropBox();
        this.setupNavigation();
        this.setupOutputSettings();
        this.setupThemeToggle();
        this.setupKeyboardControls();
        this.setupKeyConfigUI();
        this.setupModeToggle();
        this.setupRatioSelector();
        this.loadTheme();
        this.updateKeyHints();
    }

    // モード切替設定
    setupModeToggle() {
        if (!this.modeToggle) return;

        const buttons = this.modeToggle.querySelectorAll('.mode-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.setMode(mode);
            });
        });
    }

    setMode(mode) {
        this.currentMode = mode;

        // ボタンのアクティブ状態を更新
        const buttons = this.modeToggle.querySelectorAll('.mode-btn');
        buttons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // X用UIの表示切替
        if (this.ratioSelector) {
            this.ratioSelector.hidden = (mode !== 'x');
        }
        if (this.thumbGuide) {
            this.thumbGuide.hidden = (mode !== 'x');
        }

        // 画像が読み込まれている場合、クロップデータを再計算
        if (this.images.length > 0) {
            this.recalculateCropDataForMode();
            this.displayCurrentImage();
        }
    }

    // 比率選択設定
    setupRatioSelector() {
        if (!this.ratioPreset) return;

        this.customRatioDiv = document.getElementById('customRatio');
        this.ratioWInput = document.getElementById('ratioW');
        this.ratioHInput = document.getElementById('ratioH');

        this.ratioPreset.addEventListener('change', () => {
            const value = this.ratioPreset.value;

            if (value === 'custom') {
                this.customRatioDiv.hidden = false;
                this.currentRatio = {
                    w: parseInt(this.ratioWInput.value) || 9,
                    h: parseInt(this.ratioHInput.value) || 16
                };
            } else {
                this.customRatioDiv.hidden = true;
                const [w, h] = value.split(':').map(Number);
                this.currentRatio = { w, h };
            }

            // 現在の画像のみクロップデータを再計算
            if (this.images.length > 0 && this.currentMode === 'x') {
                this.recalculateCurrentImageCrop();
                this.displayCurrentImage();
            }
        });

        // カスタム比率入力時
        const updateCustomRatio = () => {
            if (this.ratioPreset.value !== 'custom') return;

            const w = parseInt(this.ratioWInput.value) || 9;
            const h = parseInt(this.ratioHInput.value) || 16;
            this.currentRatio = { w, h };

            if (this.images.length > 0 && this.currentMode === 'x') {
                this.recalculateCurrentImageCrop();
                this.displayCurrentImage();
            }
        };

        if (this.ratioWInput) this.ratioWInput.addEventListener('change', updateCustomRatio);
        if (this.ratioHInput) this.ratioHInput.addEventListener('change', updateCustomRatio);
    }

    // 現在の画像のみクロップデータを再計算
    recalculateCurrentImageCrop() {
        const current = this.images[this.currentIndex];
        if (!current) return;

        const img = current.img;
        const { w, h } = this.currentRatio;
        const ratio = w / h;
        let cropWidth, cropHeight;

        if (img.width / img.height > ratio) {
            cropHeight = img.height;
            cropWidth = cropHeight * ratio;
        } else {
            cropWidth = img.width;
            cropHeight = cropWidth / ratio;
        }

        current.cropData = {
            x: (img.width - cropWidth) / 2,
            y: (img.height - cropHeight) / 2,
            width: cropWidth,
            height: cropHeight,
            ratio: { w, h }
        };
        // 確定状態はリセット
        current.confirmed = false;
    }

    // モード変更時にクロップデータを再計算
    recalculateCropDataForMode() {
        this.images.forEach(imageData => {
            const img = imageData.img;
            if (this.currentMode === 'pixiv') {
                // Pixiv用：正方形
                const minDim = Math.min(img.width, img.height);
                imageData.cropData = {
                    x: (img.width - minDim) / 2,
                    y: (img.height - minDim) / 2,
                    width: minDim,
                    height: minDim
                };
            } else {
                // X用：指定比率
                const { w, h } = this.currentRatio;
                const ratio = w / h;
                let cropWidth, cropHeight;

                if (img.width / img.height > ratio) {
                    // 画像が横長の場合、高さを基準
                    cropHeight = img.height;
                    cropWidth = cropHeight * ratio;
                } else {
                    // 画像が縦長の場合、幅を基準
                    cropWidth = img.width;
                    cropHeight = cropWidth / ratio;
                }

                imageData.cropData = {
                    x: (img.width - cropWidth) / 2,
                    y: (img.height - cropHeight) / 2,
                    width: cropWidth,
                    height: cropHeight
                };
            }
            // 確定状態はリセットしない（位置のみ再計算）
        });
    }

    // ドロップゾーン設定
    setupDropZone() {
        // フォルダ選択ボタン（ファイル選択ダイアログを開く）
        this.folderBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.isDialogOpen) return;
            this.isDialogOpen = true;
            this.fileInput.click();
        });

        // クリックでファイル選択（フォルダボタン以外）
        this.dropZone.addEventListener('click', (e) => {
            // フォルダボタンやその子要素がクリックされた場合は無視
            if (e.target === this.folderBtn || this.folderBtn.contains(e.target)) {
                return;
            }
            if (this.isDialogOpen) return;
            this.isDialogOpen = true;
            this.fileInput.click();
        });

        // ドラッグオーバー
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('drag-over');
        });

        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('drag-over');
        });

        // ドロップ
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            if (files.length > 0) {
                this.loadImages(files);
            }
        });

        // ファイル選択
        this.fileInput.addEventListener('change', (e) => {
            this.isDialogOpen = false;
            const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
            if (files.length > 0) {
                this.loadImages(files);
            }
            // 同じファイルを再選択できるようにリセット
            e.target.value = '';
        });

        // フォルダ選択
        this.folderInput.addEventListener('change', (e) => {
            this.isDialogOpen = false;
            const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
            if (files.length > 0) {
                this.loadImages(files);
            }
            // 同じフォルダを再選択できるようにリセット
            e.target.value = '';
        });

        // ダイアログがキャンセルされた場合のフラグリセット
        window.addEventListener('focus', () => {
            // ダイアログが閉じた後にフォーカスが戻る
            setTimeout(() => {
                this.isDialogOpen = false;
            }, 300);
        });
    }

    // 画像読み込み
    loadImages(files) {
        this.images = [];
        this.currentIndex = 0;
        this.loadingOverlay.hidden = false;

        const loadPromises = files.map((file, index) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const cropData = this.calculateInitialCropData(img);
                    const thumbUrl = URL.createObjectURL(file);
                    resolve({ file, img, cropData, index, confirmed: false, thumbUrl });
                };
                img.src = URL.createObjectURL(file);
            });
        });

        Promise.all(loadPromises).then((results) => {
            this.images = results.sort((a, b) => a.index - b.index);
            this.loadingOverlay.hidden = true;
            this.showEditor();
            this.renderThumbnails();
            this.displayCurrentImage();
        });
    }

    // 初期クロップデータの計算
    calculateInitialCropData(img) {
        if (this.currentMode === 'pixiv') {
            // Pixiv用：正方形
            const minDim = Math.min(img.width, img.height);
            return {
                x: (img.width - minDim) / 2,
                y: (img.height - minDim) / 2,
                width: minDim,
                height: minDim,
                ratio: { w: 1, h: 1 } // 正方形
            };
        } else {
            // X用：指定比率
            const { w, h } = this.currentRatio;
            const ratio = w / h;
            let cropWidth, cropHeight;

            if (img.width / img.height > ratio) {
                cropHeight = img.height;
                cropWidth = cropHeight * ratio;
            } else {
                cropWidth = img.width;
                cropHeight = cropWidth / ratio;
            }

            return {
                x: (img.width - cropWidth) / 2,
                y: (img.height - cropHeight) / 2,
                width: cropWidth,
                height: cropHeight,
                ratio: { w, h } // 各画像ごとに比率を記録
            };
        }
    }

    // エディタ表示
    showEditor() {
        this.dropZone.hidden = true;
        this.editorWrapper.hidden = false;
        this.statsEl.hidden = false;
        this.updateStats();
    }

    // サムネイル描画
    renderThumbnails() {
        this.thumbnailBar.innerHTML = '';

        this.images.forEach((imageData, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'thumbnail';
            if (index === this.currentIndex) thumb.classList.add('active');
            if (imageData.confirmed) thumb.classList.add('confirmed');

            const img = document.createElement('img');
            img.src = imageData.thumbUrl;
            thumb.appendChild(img);

            const number = document.createElement('span');
            number.className = 'thumbnail-number';
            number.textContent = index + 1;
            thumb.appendChild(number);

            thumb.addEventListener('click', () => {
                this.currentIndex = index;
                this.displayCurrentImage();
                this.updateThumbnails();
            });

            this.thumbnailBar.appendChild(thumb);
        });
    }

    // サムネイル更新
    updateThumbnails() {
        const thumbs = this.thumbnailBar.querySelectorAll('.thumbnail');
        thumbs.forEach((thumb, index) => {
            thumb.classList.toggle('active', index === this.currentIndex);
            thumb.classList.toggle('confirmed', this.images[index].confirmed);
        });

        // 現在のサムネイルが見えるようにスクロール
        const activeThumb = thumbs[this.currentIndex];
        if (activeThumb) {
            activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }

    // 現在の画像を表示
    displayCurrentImage() {
        const current = this.images[this.currentIndex];
        if (!current) return;

        const img = current.img;
        const containerWidth = this.editor.clientWidth || 800;
        const maxHeight = window.innerHeight * 0.5;

        // スケール計算（幅と高さの両方を考慮）
        const scaleW = Math.min(1, containerWidth / img.width);
        const scaleH = Math.min(1, maxHeight / img.height);
        this.scale = Math.min(scaleW, scaleH);

        // Retina対応：devicePixelRatioを考慮
        const dpr = window.devicePixelRatio || 1;
        const displayWidth = img.width * this.scale;
        const displayHeight = img.height * this.scale;

        // キャンバスの実際のピクセルサイズ（高解像度）
        this.canvas.width = displayWidth * dpr;
        this.canvas.height = displayHeight * dpr;

        // CSSでの表示サイズ
        this.canvas.style.width = displayWidth + 'px';
        this.canvas.style.height = displayHeight + 'px';

        // コンテキストをリセットしてからスケール
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // 画像描画（高品質）
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.drawImage(img, 0, 0, displayWidth, displayHeight);

        // X用モードの場合、その画像の比率をUIに反映
        if (this.currentMode === 'x' && current.cropData.ratio) {
            this.updateRatioUI(current.cropData.ratio);
        }

        // トリミング枠を更新
        this.updateCropBox();
        this.updateConfirmStatus();
        this.updateThumbnails();
        this.updateStats();

        // 現在位置表示
        this.currentPosEl.textContent = `${this.currentIndex + 1} / ${this.images.length}`;
    }

    // 比率UIを更新（画像切替時）
    updateRatioUI(ratio) {
        if (!this.ratioPreset) return;

        const { w, h } = ratio;
        const ratioStr = `${w}:${h}`;

        // プリセットに一致するか確認
        const options = Array.from(this.ratioPreset.options);
        const matchingOption = options.find(opt => opt.value === ratioStr);

        if (matchingOption) {
            this.ratioPreset.value = ratioStr;
            if (this.customRatioDiv) this.customRatioDiv.hidden = true;
        } else {
            // カスタム比率
            this.ratioPreset.value = 'custom';
            if (this.customRatioDiv) this.customRatioDiv.hidden = false;
            if (this.ratioWInput) this.ratioWInput.value = w;
            if (this.ratioHInput) this.ratioHInput.value = h;
        }

        this.currentRatio = { w, h };
    }

    // トリミング枠を更新
    updateCropBox() {
        const current = this.images[this.currentIndex];
        if (!current) return;

        const { x, y, width, height } = current.cropData;

        this.cropBox.style.left = (x * this.scale) + 'px';
        this.cropBox.style.top = (y * this.scale) + 'px';
        this.cropBox.style.width = (width * this.scale) + 'px';
        this.cropBox.style.height = (height * this.scale) + 'px';

        // 確定状態に応じてスタイル変更
        if (current.confirmed) {
            this.cropBox.classList.add('confirmed');
        } else {
            this.cropBox.classList.remove('confirmed');
        }

        // X用：サムネガイド（3:4）を更新
        this.updateThumbGuide(width, height);
    }

    // サムネガイド（3:4）を更新
    updateThumbGuide(cropWidth, cropHeight) {
        if (!this.thumbGuide || this.currentMode !== 'x') {
            if (this.thumbGuide) this.thumbGuide.hidden = true;
            return;
        }

        this.thumbGuide.hidden = false;

        // 3:4比率のガイドをクロップ枠内中央に配置
        const guideRatio = 3 / 4;
        const cropBoxWidth = cropWidth * this.scale;
        const cropBoxHeight = cropHeight * this.scale;

        let guideWidth, guideHeight;

        // クロップ枠の幅を基準に3:4のガイドを計算
        if (cropBoxWidth / cropBoxHeight > guideRatio) {
            // クロップ枠が横長の場合、高さを基準
            guideHeight = cropBoxHeight;
            guideWidth = guideHeight * guideRatio;
        } else {
            // クロップ枠が縦長の場合、幅を基準
            guideWidth = cropBoxWidth;
            guideHeight = guideWidth / guideRatio;
        }

        // 中央に配置
        const guideLeft = (cropBoxWidth - guideWidth) / 2;
        const guideTop = (cropBoxHeight - guideHeight) / 2;

        this.thumbGuide.style.left = guideLeft + 'px';
        this.thumbGuide.style.top = guideTop + 'px';
        this.thumbGuide.style.width = guideWidth + 'px';
        this.thumbGuide.style.height = guideHeight + 'px';
    }

    // トリミング枠の操作設定
    setupCropBox() {
        // ドラッグ開始
        this.cropBox.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('crop-handle')) {
                this.isResizing = true;
                this.resizeHandle = e.target.dataset.handle;
            } else {
                this.isDragging = true;
            }

            this.dragStart = { x: e.clientX, y: e.clientY };
            const current = this.images[this.currentIndex];
            this.cropStart = { ...current.cropData };

            e.preventDefault();
        });

        // マウス移動
        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging && !this.isResizing) return;

            const current = this.images[this.currentIndex];
            if (!current) return;

            const dx = (e.clientX - this.dragStart.x) / this.scale;
            const dy = (e.clientY - this.dragStart.y) / this.scale;

            if (this.isDragging) {
                let newX = this.cropStart.x + dx;
                let newY = this.cropStart.y + dy;

                newX = Math.max(0, Math.min(newX, current.img.width - current.cropData.width));
                newY = Math.max(0, Math.min(newY, current.img.height - current.cropData.height));

                current.cropData.x = newX;
                current.cropData.y = newY;
            } else if (this.isResizing) {
                this.handleResize(dx, dy, current);
            }

            this.updateCropBox();
        });

        // マウスアップ
        document.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.isResizing = false;
            this.resizeHandle = null;
        });

        // タッチ対応
        this.cropBox.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            if (e.target.classList.contains('crop-handle')) {
                this.isResizing = true;
                this.resizeHandle = e.target.dataset.handle;
            } else {
                this.isDragging = true;
            }

            this.dragStart = { x: touch.clientX, y: touch.clientY };
            const current = this.images[this.currentIndex];
            this.cropStart = { ...current.cropData };

            e.preventDefault();
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (!this.isDragging && !this.isResizing) return;

            const touch = e.touches[0];
            const current = this.images[this.currentIndex];
            if (!current) return;

            const dx = (touch.clientX - this.dragStart.x) / this.scale;
            const dy = (touch.clientY - this.dragStart.y) / this.scale;

            if (this.isDragging) {
                let newX = this.cropStart.x + dx;
                let newY = this.cropStart.y + dy;

                newX = Math.max(0, Math.min(newX, current.img.width - current.cropData.width));
                newY = Math.max(0, Math.min(newY, current.img.height - current.cropData.height));

                current.cropData.x = newX;
                current.cropData.y = newY;
            } else if (this.isResizing) {
                this.handleResize(dx, dy, current);
            }

            this.updateCropBox();
        }, { passive: false });

        document.addEventListener('touchend', () => {
            this.isDragging = false;
            this.isResizing = false;
            this.resizeHandle = null;
        });
    }

    // リサイズ処理
    handleResize(dx, dy, current) {
        const img = current.img;

        if (this.currentMode === 'pixiv') {
            // Pixiv用：正方形リサイズ
            this.handleSquareResize(dx, dy, current, img);
        } else {
            // X用：比率固定リサイズ
            this.handleRatioResize(dx, dy, current, img);
        }
    }

    // Pixiv用：正方形リサイズ
    handleSquareResize(dx, dy, current, img) {
        let newSize, newX, newY;
        const startSize = this.cropStart.width; // 正方形なのでwidthを使用

        switch (this.resizeHandle) {
            case 'se':
                newSize = startSize + Math.max(dx, dy);
                newX = this.cropStart.x;
                newY = this.cropStart.y;
                break;
            case 'sw':
                newSize = startSize + Math.max(-dx, dy);
                newX = this.cropStart.x - (newSize - startSize);
                newY = this.cropStart.y;
                break;
            case 'ne':
                newSize = startSize + Math.max(dx, -dy);
                newX = this.cropStart.x;
                newY = this.cropStart.y - (newSize - startSize);
                break;
            case 'nw':
                newSize = startSize + Math.max(-dx, -dy);
                newX = this.cropStart.x - (newSize - startSize);
                newY = this.cropStart.y - (newSize - startSize);
                break;
        }

        const minSize = 50;
        newSize = Math.max(minSize, newSize);

        if (newX < 0) {
            newSize = newSize + newX;
            newX = 0;
        }
        if (newY < 0) {
            newSize = newSize + newY;
            newY = 0;
        }
        if (newX + newSize > img.width) {
            newSize = img.width - newX;
        }
        if (newY + newSize > img.height) {
            newSize = img.height - newY;
        }

        newSize = Math.min(newSize, img.width - newX, img.height - newY);

        current.cropData.x = newX;
        current.cropData.y = newY;
        current.cropData.width = newSize;
        current.cropData.height = newSize;
    }

    // X用：比率固定リサイズ
    handleRatioResize(dx, dy, current, img) {
        const { w, h } = this.currentRatio;
        const ratio = w / h;

        let newWidth, newHeight, newX, newY;
        const startWidth = this.cropStart.width;
        const startHeight = this.cropStart.height;

        // リサイズ量を計算（対角方向の動きを基準）
        let delta;
        switch (this.resizeHandle) {
            case 'se':
                delta = Math.max(dx, dy * ratio);
                newWidth = startWidth + delta;
                newHeight = newWidth / ratio;
                newX = this.cropStart.x;
                newY = this.cropStart.y;
                break;
            case 'sw':
                delta = Math.max(-dx, dy * ratio);
                newWidth = startWidth + delta;
                newHeight = newWidth / ratio;
                newX = this.cropStart.x - (newWidth - startWidth);
                newY = this.cropStart.y;
                break;
            case 'ne':
                delta = Math.max(dx, -dy * ratio);
                newWidth = startWidth + delta;
                newHeight = newWidth / ratio;
                newX = this.cropStart.x;
                newY = this.cropStart.y - (newHeight - startHeight);
                break;
            case 'nw':
                delta = Math.max(-dx, -dy * ratio);
                newWidth = startWidth + delta;
                newHeight = newWidth / ratio;
                newX = this.cropStart.x - (newWidth - startWidth);
                newY = this.cropStart.y - (newHeight - startHeight);
                break;
        }

        const minWidth = 50;
        const minHeight = minWidth / ratio;

        newWidth = Math.max(minWidth, newWidth);
        newHeight = newWidth / ratio;

        // 境界チェック
        if (newX < 0) {
            newWidth = newWidth + newX;
            newHeight = newWidth / ratio;
            newX = 0;
        }
        if (newY < 0) {
            newHeight = newHeight + newY;
            newWidth = newHeight * ratio;
            newY = 0;
        }
        if (newX + newWidth > img.width) {
            newWidth = img.width - newX;
            newHeight = newWidth / ratio;
        }
        if (newY + newHeight > img.height) {
            newHeight = img.height - newY;
            newWidth = newHeight * ratio;
        }

        current.cropData.x = newX;
        current.cropData.y = newY;
        current.cropData.width = newWidth;
        current.cropData.height = newHeight;
    }

    // ナビゲーション設定
    setupNavigation() {
        // キーボードのみで操作
    }

    prevImage() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.displayCurrentImage();
        }
    }

    nextImage() {
        if (this.currentIndex < this.images.length - 1) {
            this.currentIndex++;
            this.displayCurrentImage();
        }
    }

    // トリミング確定
    confirmCrop() {
        const current = this.images[this.currentIndex];
        if (!current) return;

        const wasConfirmed = current.confirmed;
        current.confirmed = !current.confirmed;
        this.updateCropBox();
        this.updateConfirmStatus(wasConfirmed); // 解除時はtrue
        this.updateThumbnails();
        this.updateStats();
        this.updateDownloadButton();

        // 確定したら自動で次へ
        if (current.confirmed && this.currentIndex < this.images.length - 1) {
            setTimeout(() => this.nextImage(), 150);
        }
    }

    // 統計情報更新
    updateStats() {
        const confirmedCount = this.images.filter(img => img.confirmed).length;
        this.confirmedCountEl.textContent = confirmedCount;
        this.totalCountEl.textContent = this.images.length;
    }

    // 確定状態の表示更新
    updateConfirmStatus(showUnconfirm = false) {
        const current = this.images[this.currentIndex];
        if (!current) return;

        if (current.confirmed) {
            this.confirmIndicator.textContent = '範囲確定';
            this.confirmIndicator.style.color = '#22c55e';
        } else if (showUnconfirm) {
            this.confirmIndicator.textContent = '確定解除';
            this.confirmIndicator.style.color = 'var(--text-secondary)';
            // 1.5秒後に消す
            setTimeout(() => {
                if (!this.images[this.currentIndex]?.confirmed) {
                    this.confirmIndicator.textContent = '';
                }
            }, 1500);
        } else {
            this.confirmIndicator.textContent = '';
        }

        this.updateDownloadButton();
    }

    updateDownloadButton() {
        const confirmedCount = this.images.filter(img => img.confirmed).length;
        this.downloadBtn.disabled = confirmedCount === 0;
        this.downloadBtn.textContent = confirmedCount > 0
            ? `Download ZIP (${confirmedCount}枚)`
            : 'Download ZIP';
    }

    // 出力設定
    setupOutputSettings() {
        this.sizePreset.addEventListener('change', () => {
            const isCustom = this.sizePreset.value === 'custom';
            this.customSize.hidden = !isCustom;
            this.sizeUnit.hidden = !isCustom;
        });

        this.downloadBtn.addEventListener('click', () => this.downloadZip());
    }

    getOutputSize() {
        if (this.sizePreset.value === 'custom') {
            return parseInt(this.customSize.value) || 1080;
        }
        return parseInt(this.sizePreset.value);
    }

    // ZIPダウンロード
    async downloadZip() {
        const confirmedImages = this.images.filter(img => img.confirmed);
        if (confirmedImages.length === 0) return;

        this.loadingOverlay.hidden = false;
        this.downloadBtn.disabled = true;

        try {
            const zip = new JSZip();
            const outputSize = this.getOutputSize();

            for (let i = 0; i < confirmedImages.length; i++) {
                const { img, cropData, file } = confirmedImages[i];

                // モードに応じた出力サイズ計算
                let outWidth, outHeight;
                if (this.currentMode === 'pixiv') {
                    // Pixiv用：正方形
                    outWidth = outputSize;
                    outHeight = outputSize;
                } else {
                    // X用：長辺を基準に、各画像の比率で計算
                    const { w, h } = cropData.ratio || this.currentRatio;
                    if (w >= h) {
                        // 横長または正方形：幅が長辺
                        outWidth = outputSize;
                        outHeight = outputSize * (h / w);
                    } else {
                        // 縦長：高さが長辺
                        outHeight = outputSize;
                        outWidth = outputSize * (w / h);
                    }
                }

                const croppedCanvas = document.createElement('canvas');
                croppedCanvas.width = Math.round(outWidth);
                croppedCanvas.height = Math.round(outHeight);
                const croppedCtx = croppedCanvas.getContext('2d');

                croppedCtx.drawImage(
                    img,
                    cropData.x, cropData.y, cropData.width, cropData.height,
                    0, 0, croppedCanvas.width, croppedCanvas.height
                );

                const croppedBlob = await new Promise(resolve => {
                    croppedCanvas.toBlob(resolve, 'image/png');
                });

                const baseName = (i + 1).toString();

                if (this.currentMode === 'pixiv') {
                    // Pixiv用：クロップ画像 + 元画像
                    const ext = file.name.split('.').pop() || 'png';
                    zip.file(`${baseName}-1.png`, croppedBlob);
                    zip.file(`${baseName}-2.${ext}`, file);
                } else {
                    // X用：クロップ画像のみ
                    zip.file(`${baseName}.png`, croppedBlob);
                }
            }

            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.currentMode === 'pixiv' ? 'square-crop.zip' : 'x-crop.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error('ZIP生成エラー:', error);
            alert('ZIP生成中にエラーが発生しました。');
        } finally {
            this.loadingOverlay.hidden = true;
            this.downloadBtn.disabled = false;
            this.updateDownloadButton();
        }
    }

    // テーマ切替設定
    setupThemeToggle() {
        this.themeToggle.addEventListener('click', () => {
            const isDark = document.documentElement.dataset.theme === 'dark';
            document.documentElement.dataset.theme = isDark ? 'light' : 'dark';
            localStorage.setItem('theme', isDark ? 'light' : 'dark');
        });
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            document.documentElement.dataset.theme = savedTheme;
        } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.dataset.theme = 'dark';
        }
    }

    // キーボード操作
    setupKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            // キーコンフィグ設定中は無視
            if (this.isSettingKey) return;
            if (this.images.length === 0) return;

            const key = e.key.toLowerCase();

            if (key === this.keyConfig.next.toLowerCase()) {
                this.nextImage();
                e.preventDefault();
            } else if (key === this.keyConfig.prev.toLowerCase()) {
                this.prevImage();
                e.preventDefault();
            } else if (key === this.keyConfig.confirm.toLowerCase()) {
                this.confirmCrop();
                e.preventDefault();
            }
        });
    }

    // キーコンフィグの読み込み
    loadKeyConfig() {
        const saved = localStorage.getItem('keyConfig');
        if (saved) {
            try {
                this.keyConfig = JSON.parse(saved);
            } catch (e) {
                console.error('キーコンフィグの読み込みエラー:', e);
            }
        }
    }

    // キーコンフィグの保存
    saveKeyConfig() {
        localStorage.setItem('keyConfig', JSON.stringify(this.keyConfig));
    }

    // キーヒントの更新
    updateKeyHints() {
        if (this.hintsKeys) {
            const prevKey = this.keyConfig.prev.toUpperCase();
            const nextKey = this.keyConfig.next.toUpperCase();
            const confirmKey = this.keyConfig.confirm.toUpperCase();
            this.hintsKeys.textContent = `${prevKey}/${nextKey} 移動 | ${confirmKey} 確定`;
        }
    }

    // キーコンフィグUIのセットアップ
    setupKeyConfigUI() {
        const settingsBtn = document.getElementById('settingsBtn');
        const keyConfigModal = document.getElementById('keyConfigModal');
        const closeModalBtn = document.getElementById('closeModalBtn');

        if (!settingsBtn || !keyConfigModal) return;

        // 設定ボタンクリック
        settingsBtn.addEventListener('click', () => {
            this.openKeyConfigModal();
        });

        // 閉じるボタン
        closeModalBtn.addEventListener('click', () => {
            this.closeKeyConfigModal();
        });

        // モーダル外クリックで閉じる
        keyConfigModal.addEventListener('click', (e) => {
            if (e.target === keyConfigModal) {
                this.closeKeyConfigModal();
            }
        });

        // キー設定ボタン
        document.querySelectorAll('.key-set-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.startKeyCapture(btn);
            });
        });

        // 初期値を表示
        this.updateKeyConfigDisplay();
    }

    openKeyConfigModal() {
        const modal = document.getElementById('keyConfigModal');
        modal.hidden = false;
        this.updateKeyConfigDisplay();
    }

    closeKeyConfigModal() {
        const modal = document.getElementById('keyConfigModal');
        modal.hidden = true;
        this.isSettingKey = false;
        document.querySelectorAll('.key-set-btn').forEach(btn => {
            btn.classList.remove('waiting');
        });
    }

    updateKeyConfigDisplay() {
        document.getElementById('keyPrev').textContent = this.keyConfig.prev.toUpperCase();
        document.getElementById('keyNext').textContent = this.keyConfig.next.toUpperCase();
        document.getElementById('keyConfirm').textContent = this.keyConfig.confirm.toUpperCase();
    }

    startKeyCapture(btn) {
        // 他のボタンのwaiting状態をリセット
        document.querySelectorAll('.key-set-btn').forEach(b => {
            b.classList.remove('waiting');
        });

        btn.classList.add('waiting');
        btn.textContent = '...';
        this.isSettingKey = true;
        this.currentKeyTarget = btn.dataset.key;

        const handler = (e) => {
            e.preventDefault();
            const key = e.key;

            // Escapeでキャンセル
            if (key === 'Escape') {
                this.isSettingKey = false;
                btn.classList.remove('waiting');
                this.updateKeyConfigDisplay();
                document.removeEventListener('keydown', handler);
                return;
            }

            // 特殊キーは除外
            if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(key)) {
                return;
            }

            // キーを設定
            this.keyConfig[this.currentKeyTarget] = key.length === 1 ? key : key;
            this.saveKeyConfig();
            this.updateKeyConfigDisplay();
            this.updateKeyHints();

            this.isSettingKey = false;
            btn.classList.remove('waiting');
            document.removeEventListener('keydown', handler);
        };

        document.addEventListener('keydown', handler);
    }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    new SquareCrop();
});
