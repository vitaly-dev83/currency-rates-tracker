/**
 * Currency Rates Tracker
 * 
 * Получает курсы валют с публичного API и записывает в Google Таблицу.
 * Поддерживает пользовательское меню, автоматическое обновление по расписанию,
 * расширенную обработку ошибок и экспорт данных.
 * 
 * @author Your Name
 * @version 2.0.0
 */

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

const CONFIG = {
  API: {
    // Основной API (Frankfurter - Европейский Центробанк)
    PRIMARY: 'https://api.frankfurter.app/latest',
    // Резервный API (ExchangeRate.host)
    FALLBACK: 'https://api.exchangerate.host/latest'
  },
  CURRENCIES: {
    BASE: 'USD',           // Базовая валюта
    TARGETS: ['EUR', 'GBP', 'CHF', 'JPY', 'CAD']  // Целевые валюты
  },
  SHEET: {
    HEADER_ROW: 1,         // Строка с заголовками
    STATUS_CELL: 'G1'      // Ячейка для статуса (G1)
  },
  UI: {
    MENU_NAME: '📈 Currency Tracker',
    ABOUT_TEXT: 'Currency Rates Tracker\n\nПолучает актуальные курсы валют с API Европейского Центробанка.\n\nВалюты: EUR, GBP, CHF, JPY, CAD\nОбновление: по кнопке или каждый час\n\nСоздано для тестового задания / пет-проекта'
  }
};

// ============================================
// ОСНОВНАЯ ФУНКЦИЯ (с автоматическим резервированием)
// ============================================

/**
 * Получает курсы валют и записывает их в активный лист таблицы.
 * Поддерживает fallback API при недоступности основного.
 */
function fetchAndStoreRates() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const timestamp = new Date();
  
  try {
    // Пытаемся получить данные от основного API
    let data = null;
    let apiUsed = 'primary';
    
    try {
      data = fetchFromAPI(CONFIG.API.PRIMARY);
      validateAPIData(data);
    } catch (primaryError) {
      console.warn('Primary API failed:', primaryError.message);
      apiUsed = 'fallback';
      
      try {
        data = fetchFromAPI(CONFIG.API.FALLBACK);
        validateAPIData(data);
      } catch (fallbackError) {
        throw new Error(`Both APIs unavailable. Primary: ${primaryError.message}. Fallback: ${fallbackError.message}`);
      }
    }
    
    // Записываем данные в таблицу
    writeDataToSheet(sheet, data, timestamp);
    
    // Обновляем статус в ячейке G1
    updateStatus(sheet, timestamp, apiUsed, '✅ Успешно', data.date);
    
  } catch (error) {
    console.error('Fatal error:', error);
    updateStatus(sheet, timestamp, 'error', `❌ Ошибка: ${error.message}`);
    
    // Дополнительно: отправить email при критической ошибке (опционально)
    // sendErrorAlert(error.message);
  }
}

/**
 * Выполняет HTTP-запрос к API и возвращает распарсенный JSON
 * @param {string} apiUrl - URL API
 * @returns {Object} Распарсенный ответ API
 */
function fetchFromAPI(apiUrl) {
  const url = buildApiUrl(apiUrl);
  const response = UrlFetchApp.fetch(url, { 
    muteHttpExceptions: true,
    timeout: 10000  // 10 seconds timeout
  });
  
  const statusCode = response.getResponseCode();
  if (statusCode !== 200) {
    throw new Error(`HTTP ${statusCode}: ${response.getContentText()}`);
  }
  
  return JSON.parse(response.getContentText());
}

/**
 * Проверяет, что данные от API содержат необходимые поля
 * @param {Object} data - Данные от API
 */
function validateAPIData(data) {
  if (!data || !data.rates) {
    throw new Error('API response missing required fields');
  }
  
  // Проверяем, что есть хотя бы одна целевая валюта
  const hasTargetRate = CONFIG.CURRENCIES.TARGETS.some(
    currency => data.rates[currency] !== undefined
  );
  
  if (!hasTargetRate) {
    throw new Error('No target currencies found in API response');
  }
}

/**
 * Формирует URL с параметрами
 * @param {string} baseUrl - Базовый URL API
 * @returns {string} Полный URL
 */
function buildApiUrl(baseUrl) {
  const symbols = CONFIG.CURRENCIES.TARGETS.join(',');
  return `${baseUrl}?from=${CONFIG.CURRENCIES.BASE}&to=${symbols}`;
}

/**
 * Записывает данные в Google Таблицу
 * @param {Sheet} sheet - Лист таблицы
 * @param {Object} data - Данные от API
 * @param {Date} timestamp - Время запроса
 */
function writeDataToSheet(sheet, data, timestamp) {
  // Создаём заголовки, если их нет
  if (sheet.getLastRow() === 0) {
    createHeaders(sheet);
  }
  
  const rates = data.rates;
  const rows = [];
  const lastUpdated = data.date || timestamp.toISOString().split('T')[0];
  
  for (let i = 0; i < CONFIG.CURRENCIES.TARGETS.length; i++) {
    const currency = CONFIG.CURRENCIES.TARGETS[i];
    const rate = rates[currency];
    
    rows.push([
      CONFIG.CURRENCIES.BASE,           // Базовая валюта
      currency,                          // Целевая валюта
      rate ? rate.toFixed(4) : 'N/A',    // Курс
      lastUpdated,                       // Дата от API
      formatTimestamp(timestamp),        // Время обновления в таблице
      rate ? '✅' : '⚠️'                  // Статус
    ]);
  }
  
  // Очищаем старые данные (со 2-й строки и ниже)
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, 6).clearContent();
  }
  
  // Записываем новые данные
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 6).setValues(rows);
  }
}

/**
 * Создаёт заголовки столбцов
 * @param {Sheet} sheet - Лист таблицы
 */
function createHeaders(sheet) {
  const headers = [
    ['Base', 'Target', 'Rate', 'API Date', 'Updated At (Local)', 'Status']
  ];
  sheet.getRange(1, 1, 1, 6).setValues(headers);
  sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  sheet.setFrozenRows(1);  // Закрепляем строку с заголовками
}

/**
 * Обновляет ячейку статуса в таблице
 * @param {Sheet} sheet - Лист таблицы
 * @param {Date} timestamp - Время запроса
 * @param {string} apiSource - Источник API ('primary', 'fallback' или 'error')
 * @param {string} status - Статус операции
 * @param {string} apiDate - Дата от API (опционально)
 */
function updateStatus(sheet, timestamp, apiSource, status, apiDate = '') {
  const apiInfo = apiSource === 'primary' ? 'Frankfurter API' : 
                  apiSource === 'fallback' ? 'ExchangeRate.host (fallback)' : 
                  apiSource;
  const dateInfo = apiDate ? ` (data from ${apiDate})` : '';
  const message = `${formatTimestamp(timestamp)} - ${status}${dateInfo} - Source: ${apiInfo}`;
  sheet.getRange(CONFIG.SHEET.STATUS_CELL).setValue(message);
}

/**
 * Форматирует дату в читаемый строковый формат
 * @param {Date} date - Дата для форматирования
 * @returns {string} Отформатированная дата/время
 */
function formatTimestamp(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

// ============================================
// UI ФУНКЦИИ
// ============================================

/**
 * Создаёт пользовательское меню в таблице (вызывается при открытии)
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu(CONFIG.UI.MENU_NAME);
  menu.addItem('🔄 Обновить курсы сейчас', 'fetchAndStoreRates');
  menu.addSeparator();
  menu.addItem('📊 Показать дашборд', 'showDashboard');
  menu.addSeparator();
  menu.addItem('ℹ️ О программе', 'showAbout');
  menu.addToUi();
  
  // Добавляем боковую панель (опционально)
  // showSidebar();
}

/**
 * Показывает информацию о программе
 */
function showAbout() {
  const ui = SpreadsheetApp.getUi();
  ui.alert('ℹ️ О программе', CONFIG.UI.ABOUT_TEXT, ui.ButtonSet.OK);
}

/**
 * Показывает простой дашборд с последними курсами
 */
function showDashboard() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('Нет данных. Нажмите "Обновить курсы сейчас"');
    return;
  }
  
  // Получаем последние данные
  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  let message = '📈 ТЕКУЩИЕ КУРСЫ\n\n';
  
  for (let i = 0; i < data.length; i++) {
    const base = data[i][0];
    const target = data[i][1];
    const rate = data[i][2];
    message += `${base} → ${target}: ${rate}\n`;
  }
  
  SpreadsheetApp.getUi().alert(message);
}

// ============================================
// ТРИГГЕРЫ И РАСПИСАНИЕ
// ============================================

/**
 * Настраивает триггер для автоматического обновления
 * Запустить эту функцию один раз в редакторе скриптов
 */
function setupHourlyTrigger() {
  // Удаляем старые триггеры
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'fetchAndStoreRates') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Создаём новый триггер на каждый час
  ScriptApp.newTrigger('fetchAndStoreRates')
    .timeBased()
    .everyHours(1)
    .create();
  
  SpreadsheetApp.getUi().alert('✅ Автоматическое обновление настроено! Данные будут обновляться каждый час.');
}

/**
 * Останавливает автоматическое обновление
 */
function stopHourlyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let deleted = 0;
  
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'fetchAndStoreRates') {
      ScriptApp.deleteTrigger(trigger);
      deleted++;
    }
  });
  
  SpreadsheetApp.getUi().alert(`✅ Удалено триггеров: ${deleted}. Автоматическое обновление остановлено.`);
}

/**
 * Показывает статус текущих триггеров
 */
function showTriggerStatus() {
  const triggers = ScriptApp.getProjectTriggers();
  const activeTriggers = triggers.filter(t => t.getHandlerFunction() === 'fetchAndStoreRates');
  
  if (activeTriggers.length === 0) {
    SpreadsheetApp.getUi().alert('⏸️ Автоматическое обновление не настроено. Запустите setupHourlyTrigger()');
  } else {
    SpreadsheetApp.getUi().alert(`✅ Активных триггеров: ${activeTriggers.length}. Данные обновляются каждый час.`);
  }
}

// ============================================
// ЭКСПОРТ ДАННЫХ
// ============================================

/**
 * Экспортирует данные в новый Google Doc
 */
function exportToDoc() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('Нет данных для экспорта');
    return;
  }
  
  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  const doc = DocumentApp.create('Currency Rates Export - ' + formatTimestamp(new Date()));
  const body = doc.getBody();
  
  body.appendParagraph('📊 Currency Rates Report').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(`Generated: ${formatTimestamp(new Date())}`);
  body.appendParagraph('');
  
  const table = body.appendTable(data);
  table.setBorderWidth(1);
  
  doc.saveAndClose();
  
  SpreadsheetApp.getUi().alert(`✅ Экспорт создан: ${doc.getUrl()}`);
}