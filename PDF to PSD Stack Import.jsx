/*
=====================================================
 PDF-to-PSD Stack Import
 Version: 1.0.0
 Author: Elizaveta Borodina
 License: MIT
 Copyright (c) 2026 Elizaveta Borodina 

 Compatible with:
Adobe Photoshop 2024 / 2025 (tested on 26.x)

=====================================================

Description:
Imports all pages of a PDF into a single PSD document,
each page placed as a separate layer.

Features:
- RGB / CMYK / Grayscale support
- Custom DPI
- Reverse page order option
- Optional progress bar
- Silent mode
- Automatic max canvas size detection

=====================================================
*/


#target photoshop
app.bringToFront();
//app.preferences.rulerUnits = Units.PIXELS;

(function main() {

function decodeFileName(str) {
    try { return decodeURI(str); }
    catch (e) { return str; }
}

var prevDialogs = app.displayDialogs;

try {

var prevUnits = app.preferences.rulerUnits;
app.preferences.rulerUnits = Units.PIXELS;



  // =====================
// 1. ВЫБОР PDF ФАЙЛА
// =====================

    var pdfFile = File.openDialog("Выберите PDF-файл", "*.pdf");
    if (!pdfFile) return; // безопасный выход

// =====================
// 2. ДИАЛОГ ПАРАМЕТРОВ
// =====================

var dlg = new Window("dialog", "Параметры импорта PDF");
dlg.orientation = "column";
dlg.alignChildren = "left";

// ===== Цветовой режим =====
var modePanel = dlg.add("panel", undefined, "Цветовой режим");
modePanel.orientation = "column";
modePanel.alignChildren = "left";
modePanel.margins = 15;

var rbRGB  = modePanel.add("radiobutton", undefined, "RGB");
var rbCMYK = modePanel.add("radiobutton", undefined, "CMYK");
var rbGray = modePanel.add("radiobutton", undefined, "Grayscale");
rbRGB.value = true;


// ===== Разрешение =====
var resPanel = dlg.add("panel", undefined, "Разрешение (dpi)");
resPanel.orientation = "column";
resPanel.alignChildren = "left";
resPanel.margins = 15;

var rb150 = resPanel.add("radiobutton", undefined, "150 dpi");
var rb300 = resPanel.add("radiobutton", undefined, "300 dpi");
var rbCustom = resPanel.add("radiobutton", undefined, "Другое:");

var customGroup = resPanel.add("group");
customGroup.indent = 20;

var customInput = customGroup.add("edittext", undefined, "300");
customInput.characters = 6;
customInput.enabled = false;

rb300.value = true;

rbCustom.onClick = function () {
    customInput.enabled = true;
    customInput.active = true;
};

rb150.onClick = rb300.onClick = function () {
    customInput.enabled = false;
};


// ===== Порядок страниц =====
var orderPanel = dlg.add("panel", undefined, "Порядок страниц");
orderPanel.orientation = "column";
orderPanel.alignChildren = "left";
orderPanel.margins = 15;

var orderDropdown = orderPanel.add("dropdownlist", undefined, [
    "Обычный (1 → N)",
    "Инвертированный (N → 1)"
]);

orderDropdown.selection = 0;


// ===== Режим работы =====
var modePanel2 = dlg.add("panel", undefined, "Режим работы");
modePanel2.orientation = "column";
modePanel2.alignChildren = "left";
modePanel2.margins = 15;

var silentCheckbox = modePanel2.add("checkbox", undefined, "Тихий режим (без прогресс-бара)");
silentCheckbox.value = false;


// ===== Кнопки =====
var btnGroup = dlg.add("group");
btnGroup.alignment = "right";

var okBtn = btnGroup.add("button", undefined, "OK");
var cancelBtn = btnGroup.add("button", undefined, "Отмена");

okBtn.onClick = function () {

    if (rbCustom.value) {
        var testRes = parseInt(customInput.text, 10);
        if (isNaN(testRes) || testRes < 30 || testRes > 2400) {
            alert("Resolution must be between 30 and 2400 dpi.");
            customInput.active = true;
            return; // не закрываем окно
        }
    }

    dlg.close(1);
};

cancelBtn.onClick = function () {
    dlg.close(0);
};


// ===== Показ диалога =====
if (dlg.show() !== 1) {
    return;
}


// =====================
// 3. ОПРЕДЕЛЕНИЕ РЕЖИМА И РАЗРЕШЕНИЯ
// =====================

    // ================= MODE =================
    var docMode = NewDocumentMode.RGB;
    if (rbCMYK.value) docMode = NewDocumentMode.CMYK;
    else if (rbGray.value) docMode = NewDocumentMode.GRAYSCALE;

    var openMode;
    switch (docMode) {
        case NewDocumentMode.CMYK:
            openMode = OpenDocumentMode.CMYK;
            break;
        case NewDocumentMode.GRAYSCALE:
            openMode = OpenDocumentMode.GRAYSCALE;
            break;
        default:
            openMode = OpenDocumentMode.RGB;
    }

    // ================= RESOLUTION =================
    var resolution;
    if (rb150.value) resolution = 150;
    else if (rb300.value) resolution = 300;
   else {
    resolution = parseInt(customInput.text, 10);
}


var reverseOrder = (orderDropdown.selection.index === 1);
var silentMode = silentCheckbox.value;


    // ================= DISABLE DIALOGS =================
// Отключаем системные диалоги Photoshop,
// чтобы не появлялось окно PDF Import при открытии страниц.
    app.displayDialogs = DialogModes.NO;
    

 
 // =====================
// 4. ПОДСЧЁТ СТРАНИЦ
// =====================

    function countPages(file, startIndex) {
        var cnt = 0;
        var idx = startIndex;

        while (true) {
            try {
                var tmpOpts = new PDFOpenOptions();
                tmpOpts.antiAlias = true;
                tmpOpts.resolution = resolution;
                tmpOpts.cropPage = CropToType.CROPBOX;
                tmpOpts.page = idx;
                tmpOpts.mode = openMode;
                var tmpDoc = app.open(file, tmpOpts);
                tmpDoc.close(SaveOptions.DONOTSAVECHANGES);
                cnt++;
                idx++;
                if (cnt > 2000) break;
            } catch (e) {
                break;
            }
        }
        return cnt;
    }
// Некоторые PDF индексируются с 0, некоторые с 1.
// Пробуем оба варианта, чтобы определить корректную стартовую страницу.
    var startIndex = 1;
    var total = countPages(pdfFile, startIndex);
    if (total === 0) {
        startIndex = 0;
        total = countPages(pdfFile, startIndex);
    }
    if (total === 0)
        throw "Не удалось определить страницы PDF.";

 // =====================
// 5. ПЕРВЫЙ ПРОХОД — ОПРЕДЕЛЕНИЕ МАКСИМАЛЬНЫХ РАЗМЕРОВ
// =====================

var maxWidth = 0;
var maxHeight = 0;

for (var i = 0; i < total; i++) {

    var opts = new PDFOpenOptions();
    opts.antiAlias = true;
    opts.resolution = resolution;
    opts.cropPage = CropToType.CROPBOX;
    opts.page = startIndex + i;
    opts.mode = openMode;

    try {
        var tmpDoc = app.open(pdfFile, opts);

        var w = tmpDoc.width.as("px");
        var h = tmpDoc.height.as("px");

        if (w > maxWidth) maxWidth = w;
        if (h > maxHeight) maxHeight = h;

        tmpDoc.close(SaveOptions.DONOTSAVECHANGES);

    } catch (e) {
        continue;
    }
}

if (maxWidth === 0 || maxHeight === 0)
    throw "Не удалось определить размеры страниц.";



// =====================
// 6. СОЗДАЁМ ИТОГОВЫЙ ДОКУМЕНТ
// =====================

var baseName = decodeFileName(pdfFile.name).replace(/\.[^\.]+$/, "");

var createdDoc = app.documents.add(
    maxWidth,
    maxHeight,
    resolution,
    baseName + "_stack",
    docMode,
    DocumentFill.TRANSPARENT
);



// =====================
// ПРОГРЕСС-БАР
// =====================

var progressWin, progressBar, progressText;

if (!silentMode) {

    progressWin = new Window("palette", "Импорт PDF");
    progressWin.orientation = "column";
    progressWin.alignChildren = "fill";

    progressText = progressWin.add("statictext", undefined, "Подготовка...");
    progressBar = progressWin.add("progressbar", undefined, 0, total);
    progressBar.preferredSize = [300, 20];

    progressWin.show();
}



// =====================
// 7. ВТОРОЙ ПРОХОД — ИМПОРТ СТРАНИЦ
// =====================

var pagesImported = 0;


var start = reverseOrder ? total - 1 : 0;
var end   = reverseOrder ? -1 : total;
var step  = reverseOrder ? -1 : 1;

for (var i = start; i != end; i += step) {

    var opts = new PDFOpenOptions();
    opts.antiAlias = true;
    opts.resolution = resolution;
    opts.cropPage = CropToType.CROPBOX;
    opts.page = startIndex + i;
    opts.mode = openMode;

    var pdoc;

    try {
        pdoc = app.open(pdfFile, opts);

        // ===== белая подложка =====
        app.activeDocument = pdoc;

        var white = new SolidColor();

        if (docMode === NewDocumentMode.CMYK) {
            white.cmyk.cyan = 0;
            white.cmyk.magenta = 0;
            white.cmyk.yellow = 0;
            white.cmyk.black = 0;
        } else if (docMode === NewDocumentMode.GRAYSCALE) {
            white.gray.gray = 0;
        } else {
            white.rgb.red = 255;
            white.rgb.green = 255;
            white.rgb.blue = 255;
        }

        var bgLayer = pdoc.artLayers.add();
        bgLayer.name = "White Background";
        bgLayer.move(pdoc, ElementPlacement.PLACEATEND);

        pdoc.selection.selectAll();
        pdoc.selection.fill(white);
        pdoc.selection.deselect();

        pdoc.activeLayer = pdoc.layers[0];
        pdoc.activeLayer.merge();

    } catch (e) {
        continue;
    }

    // ===== копирование =====
    pdoc.selection.selectAll();
    pdoc.selection.copy(true);
    pdoc.close(SaveOptions.DONOTSAVECHANGES);

    app.activeDocument = createdDoc;

    var newLayer = createdDoc.paste();
    newLayer.name = "page-" + (startIndex + i);

    // фиксируем правильный порядок слоёв
    newLayer.move(createdDoc, ElementPlacement.PLACEATEND);

pagesImported++;
// =====================
// вывод ПРОГРЕСС-БАРА
// =====================
if (!silentMode) {
    progressBar.value = pagesImported;
    progressText.text = "Страница " + pagesImported + " из " + total;
    progressWin.update();}
}

// =====================
// Закрываем прогресс-бар после завершения
// =====================
if (!silentMode) {
    progressWin.close();
}



// =====================
// 8. ЗАВЕРШЕНИЕ
// =====================

} catch (err) {
    alert("Ошибка: " + err);
} finally {
    try { app.displayDialogs = prevDialogs; } catch(e){}
    try { app.preferences.rulerUnits = prevUnits; } catch(e){}

}

})(); 
