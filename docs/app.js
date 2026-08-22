(() => {
  "use strict";
  const STORAGE_KEY = "snachala-ty.pages.v1";
  const seed = window.PLANNER_SEED || { quotes: [], fixedPrompts: [], rotatingPrompts: [] };
  const categories = ["Работа", "Близкие", "Семья", "Хобби", "Обучение"];
  const moods = ["Тяжело", "Ниже обычного", "Ровно", "Хорошо", "Отлично"];
  const weekdayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const root = document.querySelector("#app");
  let view = "Сегодня";
  let selectedDate = todayKey();
  let selectedWeek = weekKey(selectedDate);
  let message = "";
  let timer = null;

  function defaultDraft() {
    return { weeklyPlanningWeekday: 7, weeklyGoal: "", trackers: { plank: false, pushups: false, water: false }, trackerGoals: { plank: 30, pushups: 10, water: 1500 }, trackerDays: { plank: [1,3,5], pushups: [2,4,6], water: [1,2,3,4,5,6,7] }, simpleName: "", simpleDays: [] };
  }
  function defaultState() {
    return { version: 1, onboarding: { complete: false, step: 1, draft: defaultDraft() }, days: {}, weeks: {}, habits: [], quotePrefs: { favorites: [], hidden: [] }, settings: { pageTurn: true }, createdAt: new Date().toISOString() };
  }
  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || parsed.version !== 1) return defaultState();
      return { ...defaultState(), ...parsed, onboarding: { ...defaultState().onboarding, ...parsed.onboarding, draft: { ...defaultDraft(), ...(parsed.onboarding?.draft || {}) } }, settings: { pageTurn: true, ...(parsed.settings || {}) }, quotePrefs: { favorites: [], hidden: [], ...(parsed.quotePrefs || {}) } };
    } catch { return defaultState(); }
  }
  let state = load();
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function uid(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`; }
  function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[ch])); }
  function pad(value) { return String(value).padStart(2, "0"); }
  function keyFromDate(date) { return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }
  function todayKey() { return keyFromDate(new Date()); }
  function dateFromKey(key) { const [y,m,d] = key.split("-").map(Number); return new Date(y,m-1,d,12); }
  function addDays(key, amount) { const date = dateFromKey(key); date.setDate(date.getDate()+amount); return keyFromDate(date); }
  function dayNumber(key) { const day = dateFromKey(key).getDay(); return day === 0 ? 7 : day; }
  function weekKey(key) { const date = dateFromKey(key); date.setDate(date.getDate()-(dayNumber(key)-1)); return keyFromDate(date); }
  function prettyDate(key) { return new Intl.DateTimeFormat("ru-RU", { weekday:"long", day:"numeric", month:"long", year:"numeric" }).format(dateFromKey(key)); }
  function prettyShort(key) { return new Intl.DateTimeFormat("ru-RU", { day:"2-digit", month:"2-digit", year:"numeric" }).format(dateFromKey(key)); }
  function dayEntry(key) {
    if (!state.days[key]) state.days[key] = { reflections: {}, gratitude:"", mood:"", moodNote:"", thought:"", intention:"", result:"", self:"", others:"", tasks:[], closed:false, quoteOffset:0 };
    return state.days[key];
  }
  function weekEntry(key) {
    if (!state.weeks[key]) state.weeks[key] = { goal:"", why:"", result:"", obstacle:"", planB:"", steps:["","",""] };
    return state.weeks[key];
  }
  function flash(text) { message = text; render(); window.setTimeout(() => { if (message === text) { message = ""; render(); } }, 2200); }
  function activeHabitsFor(key) { const wd = dayNumber(key); return state.habits.filter((habit) => habit.active !== false && habit.days.includes(wd)); }
  function recordFor(habit, key) { return habit.records?.[key]; }
  function totalFor(habit, key) { const value = recordFor(habit,key); if (habit.type === "simple") return value ? 1 : 0; return Array.isArray(value) ? value.reduce((sum,item)=>sum+Number(item||0),0) : 0; }
  function completedHabit(habit,key) { const total = totalFor(habit,key); return habit.type === "simple" ? total > 0 : total >= Number(habit.goal || 1); }
  function ensureRecords(habit) { if (!habit.records) habit.records = {}; }
  function quoteFor(key) {
    const day = dayEntry(key); const hidden = new Set(state.quotePrefs.hidden); const pool = seed.quotes.filter((quote) => !hidden.has(quote.id));
    if (!pool.length) return null;
    const base = key.split("").reduce((sum,ch)=>sum+ch.charCodeAt(0),0); return pool[(base + (day.quoteOffset || 0)) % pool.length];
  }

  function render() {
    if (!state.onboarding.complete) return renderOnboarding();
    root.innerHTML = `${header()}${message ? `<div class="notice success" role="status">${esc(message)}</div>` : ""}<main class="shell" id="main">${view === "Сегодня" ? renderToday() : view === "Неделя" ? renderWeek() : view === "Привычки" ? renderHabits() : view === "Прогресс" ? renderProgress() : view === "Архив" ? renderArchive() : renderSettings()}</main>`;
  }
  function header() {
    const items = ["Сегодня","Неделя","Привычки","Прогресс","Архив","Настройки"];
    return `<header class="app-header"><a href="#main" class="brand" data-action="nav" data-view="Сегодня">Сначала — ты</a><nav class="nav" aria-label="Основные разделы">${items.map((item)=>`<button data-action="nav" data-view="${item}" ${view===item?'aria-current="page"':''}>${item}</button>`).join("")}</nav></header>`;
  }

  function renderOnboarding() {
    const step = state.onboarding.step; const draft = state.onboarding.draft;
    let content = "";
    if (step === 1) content = `<h1 class="welcome-title" id="onb-title"><span>Сначала — ты.</span><em>Потом — всё остальное.</em></h1><p class="welcome-lead">Немного времени, чтобы услышать себя и выбрать главное.</p><div class="welcome-points"><p>Выберите одно действительно важное дело.</p><p>Оставьте время для себя без оценок и наказаний.</p><p>Записи останутся только в этом браузере.</p></div>`;
    if (step === 2) content = `<h1 id="onb-title">Когда удобно планировать неделю?</h1><p>Выбор сохранится только на этом устройстве.</p><div class="radio-grid">${[7,6,1,2,3,4,5].map((day)=>`<label class="choice"><input type="radio" name="plan-day" value="${day}" data-onb="weeklyPlanningWeekday" ${draft.weeklyPlanningWeekday===day?'checked':''}><span>${day===7?'Воскресенье':day===6?'Суббота':weekdayNames[day-1]}</span></label>`).join("")}</div>`;
    if (step === 3) content = `<h1 id="onb-title">Что важно на этой неделе?</h1><p>Цель необязательна. Одного ясного направления достаточно.</p>${field("Первая цель недели",draft.weeklyGoal,"textarea",'data-onb="weeklyGoal"',500)}`;
    if (step === 4) content = `<h1 id="onb-title">Добавить встроенные трекеры?</h1><p>По умолчанию ничего не включено.</p><div class="toggle-grid">${[["plank","Планка"],["pushups","Отжимания"],["water","Вода"]].map(([key,label])=>`<label class="choice"><input type="checkbox" data-onb-tracker="${key}" ${draft.trackers[key]?'checked':''}><span>${label}</span></label>`).join("")}</div>`;
    if (step === 5) {
      const selected = Object.keys(draft.trackers).filter((key)=>draft.trackers[key]);
      content = `<h1 id="onb-title">Настроить выбранные трекеры</h1>${selected.length ? selected.map((key)=>`<section class="card"><h2>${key==='plank'?'Планка':key==='pushups'?'Отжимания':'Вода'}</h2>${field(`Цель, ${key==='plank'?'секунд':key==='pushups'?'повторений':'мл'}`,draft.trackerGoals[key],"number",`data-onb-goal="${key}" min="1" max="${key==='plank'?600:100000}"`)}${weekdays(`Дни для трекера`,draft.trackerDays[key],`onb-${key}`)}</section>`).join("") : '<p class="summary">Трекеры не выбраны. Можно спокойно продолжить.</p>'}`;
    }
    if (step === 6) content = `<h1 id="onb-title">Добавить свою простую привычку?</h1><p>Например, почитать, сделать разминку или позвонить близкому.</p>${field("Название привычки",draft.simpleName,"input",'data-onb="simpleName" maxlength="80"')}${weekdays("Дни привычки",draft.simpleDays,"onb-simple")}`;
    if (step === 7) content = `<h1 id="onb-title">Всё готово для начала</h1><p class="welcome-lead">Планировщик будет хранить записи только в этом браузере. На другом компьютере знакомство начнётся заново.</p><div class="summary"><p><strong>Планирование недели:</strong> ${weekdayNames[draft.weeklyPlanningWeekday-1]}</p><p><strong>Цель:</strong> ${esc(draft.weeklyGoal.trim()||"не задана")}</p><p><strong>Трекеры:</strong> ${Object.values(draft.trackers).filter(Boolean).length||"не выбраны"}</p><p><strong>Своя привычка:</strong> ${esc(draft.simpleName.trim()||"не добавлена")}</p></div>`;
    root.innerHTML = `<main class="onboarding"><section class="onboarding-card" aria-labelledby="onb-title"><progress class="progress" max="7" value="${step}" aria-label="Шаг ${step} из 7"></progress><p class="eyebrow">Знакомство · шаг ${step} из 7</p>${content}<div class="actions">${step>1?'<button class="secondary" data-action="onb-back">Назад</button>':''}<button data-action="${step===7?'onb-finish':'onb-next'}">${step===1?'Начать знакомство':step===7?'Перейти к сегодняшнему дню':'Продолжить'}</button></div><div class="skip-actions">${step<7?'<button class="link" data-action="onb-skip">Пропустить этот шаг</button>':''}<button class="link" data-action="onb-skip-all">Пропустить всё знакомство</button></div></section></main>`;
  }
  function field(label,value,type="input",attrs="",max) { return `<label class="field"><span>${label}</span>${type==="textarea"?`<textarea ${attrs} ${max?`maxlength="${max}"`:""}>${esc(value)}</textarea>`:`<input type="${type}" value="${esc(value)}" ${attrs}>`}</label>`; }
  function weekdays(label, selected, prefix) { return `<fieldset class="field"><legend>${label}</legend><div class="weekday">${weekdayNames.map((name,index)=>`<label><input type="checkbox" data-weekday-prefix="${prefix}" value="${index+1}" ${selected.includes(index+1)?'checked':''}><span>${name}</span></label>`).join("")}</div></fieldset>`; }

  function renderToday() {
    const entry = dayEntry(selectedDate); const week = weekEntry(weekKey(selectedDate)); const past = selectedDate < todayKey(); const locked = past || entry.closed; const quote = quoteFor(selectedDate); const rotating = seed.rotatingPrompts[selectedDate.split("").reduce((s,c)=>s+c.charCodeAt(0),0)%Math.max(seed.rotatingPrompts.length,1)] || "Что сегодня особенно важно?";
    const prompts = [...seed.fixedPrompts, rotating];
    return `<div class="date-nav"><button class="secondary" data-action="day-prev" aria-label="Предыдущий день">‹</button><div><p class="eyebrow">${selectedDate===todayKey()?"Сегодня":selectedDate>todayKey()?"Будущий день":"Прошлый день · только чтение"}</p><h1>${prettyDate(selectedDate)}</h1></div><button class="secondary" data-action="day-next" aria-label="Следующий день">›</button></div><div class="book ${locked?'read-only':''}"><section class="page"><h2>Настроиться</h2><div class="section"><p class="eyebrow">Цель недели</p><p>${esc(week.goal||"Цель пока не задана")}</p></div>${quote ? `<figure class="section quote"><blockquote>${esc(quote.text)}</blockquote><footer>— ${esc(quote.author)}</footer><div class="actions"><a href="${esc(quote.sourceUrl)}" target="_blank" rel="noopener noreferrer">Источник</a><button class="link" data-action="quote-next">Другая цитата</button><button class="link" data-action="quote-favorite">${state.quotePrefs.favorites.includes(quote.id)?"Убрать из избранного":"В избранное"}</button><button class="link" data-action="quote-hide">Больше не показывать</button></div></figure>`:""}${prompts.map((prompt,index)=>field(prompt,entry.reflections[index]||"","textarea",`data-day-field="reflection-${index}" ${locked?'disabled':''}`,2000)).join("")}${field("Благодарность",entry.gratitude,"textarea",`data-day-field="gratitude" ${locked?'disabled':''}`,2000)}<div class="field"><span>Настроение</span><div class="mood">${moods.map((mood)=>`<button ${locked?'disabled':''} class="${entry.mood===mood?'active':''}" data-action="mood" data-value="${mood}">${mood}</button>`).join("")}</div></div>${field("Заметка к настроению",entry.moodNote,"textarea",`data-day-field="moodNote" ${locked?'disabled':''}`,500)}${field("Мысль дня",entry.thought,"textarea",`data-day-field="thought" ${locked?'disabled':''}`,2000)}${field("Настрой дня",entry.intention,"textarea",`data-day-field="intention" ${locked?'disabled':''}`,2000)}</section><section class="page"><h2>Выбрать главное</h2><div class="section"><p class="eyebrow">Цель недели</p><p>${esc(week.goal||"Цель пока не задана")}</p></div>${renderTasks(entry,locked)}${field("Для себя",entry.self,"textarea",`data-day-field="self" ${locked?'disabled':''}`,2000)}${field("Для других",entry.others,"textarea",`data-day-field="others" ${locked?'disabled':''}`,2000)}${field("Главный результат дня",entry.result,"textarea",`data-day-field="result" ${locked?'disabled':''}`,2000)}${renderTodayHabits(selectedDate)}${selectedDate===todayKey()?entry.closed?'<div class="closed"><strong>Завершено</strong><p>Ты молодец!</p></div>':`<div class="closed"><button data-action="finish-day" ${entry.tasks.some((task)=>task.priority===1&&task.title.trim())?'':'disabled'}>Завершить</button><p>${entry.tasks.some((task)=>task.priority===1&&task.title.trim())?'Перед завершением проверьте выбранную задачу дня.':'Перед завершением выберите одну главную задачу дня.'}</p></div>`:""}</section></div>`;
  }
  function renderTasks(entry,locked) {
    const priority = [1,2,3].map((rank)=>entry.tasks.find((task)=>task.priority===rank)).filter(Boolean);
    const other = entry.tasks.filter((task)=>!task.priority);
    const taskHtml = (task)=>`<li class="task ${task.done?'done':''}" data-task="${task.id}"><div class="task-main"><input type="checkbox" aria-label="Выполнить задачу" data-action="task-toggle" ${task.done?'checked':''}><input class="task-title" value="${esc(task.title)}" data-task-title ${locked?'disabled':''}></div><div class="task-controls"><select data-task-category ${locked?'disabled':''}>${categories.map((item)=>`<option ${task.category===item?'selected':''}>${item}</option>`).join("")}</select><select data-task-priority ${locked?'disabled':''}><option value="">Без приоритета</option>${[1,2,3].map((rank)=>`<option value="${rank}" ${task.priority===rank?'selected':''}>Задача дня № ${rank}</option>`).join("")}</select><button class="link danger" data-action="task-delete" ${locked?'disabled':''}>Удалить</button></div></li>`;
    return `<section class="section"><h3>Задачи дня</h3><ol class="task-list">${priority.length?priority.map((task)=>taskHtml(task)).join(""):'<li class="muted">Приоритеты 1–3 можно оставить пустыми.</li>'}</ol><h3>Остальные задачи</h3><ul class="task-list">${other.map((task)=>taskHtml(task)).join("")}</ul>${locked?'':`<div class="new-task"><input id="new-task" maxlength="500" placeholder="Новая задача" aria-label="Новая задача"><select id="new-category" aria-label="Категория">${categories.map((item)=>`<option>${item}</option>`).join("")}</select><button data-action="task-add">Добавить</button></div>`}</section>`;
  }
  function renderTodayHabits(key) {
    const habits = activeHabitsFor(key);
    return `<section class="section"><h3>Привычки сегодня</h3>${habits.length?habits.map((habit)=>{const total=totalFor(habit,key);const fact=habit.type==='simple'?(total?'Выполнено':'Не отмечено'):habit.type==='plank'?`${total} сек.`:habit.type==='pushups'?`${total} повторений`:`${total} мл`;return `<div class="habit-today"><div><strong>${esc(habit.name)}</strong><p class="muted">Факт: ${fact}${habit.goal?` · цель: ${habit.goal}`:''}</p></div><div>${habit.type==='simple'?`<button data-action="habit-simple" data-id="${habit.id}">${total?'Отменить':'Выполнено'}</button>`:habit.type==='plank'?`<button data-action="plank-start" data-id="${habit.id}">Запустить таймер</button>`:habit.type==='pushups'?`<input class="inline-input" id="push-${habit.id}" type="number" min="1" max="10000" aria-label="Повторения"><button data-action="push-add" data-id="${habit.id}">Добавить подход</button>`:`<button data-action="water-add" data-id="${habit.id}" data-value="200">+200 мл</button> <button data-action="water-add" data-id="${habit.id}" data-value="250">+250 мл</button>`}</div></div>`;}).join(""):'<p class="muted">На этот день привычки не запланированы.</p>'}${timer?renderTimer():""}</section>`;
  }
  function renderTimer() { return `<div class="timer" role="timer"><span>${timer.phase==='countdown'?'Приготовьтесь':'Планка'}</span><strong id="timer-value">${timer.phase==='countdown'?timer.remaining:timer.elapsed}</strong><button class="secondary" data-action="plank-stop">${timer.phase==='countdown'?'Отменить':'Остановить и сохранить'}</button></div>`; }

  function renderWeek() {
    const week = weekEntry(selectedWeek); const end = addDays(selectedWeek,6); const past = end < todayKey();
    return `<div class="date-nav"><button class="secondary" data-action="week-prev">‹</button><div><p class="eyebrow">${past?'Прошлая неделя · только чтение':selectedWeek>todayKey()?'Будущая неделя':'Текущая неделя'}</p><h1>${prettyShort(selectedWeek)} — ${prettyShort(end)}</h1></div><button class="secondary" data-action="week-next">›</button></div><section class="panel ${past?'read-only':''}">${field("Главная цель недели",week.goal,"textarea",`data-week-field="goal" ${past?'disabled':''}`,500)}${field("Почему она важна?",week.why,"textarea",`data-week-field="why" ${past?'disabled':''}`,2000)}${field("Как пойму, что цель достигнута?",week.result,"textarea",`data-week-field="result" ${past?'disabled':''}`,2000)}${field("Что может помешать?",week.obstacle,"textarea",`data-week-field="obstacle" ${past?'disabled':''}`,2000)}${field("Что сделаю, если план нарушится?",week.planB,"textarea",`data-week-field="planB" ${past?'disabled':''}`,2000)}<div class="panel-grid">${week.steps.map((step,index)=>field(`Шаг недели № ${index+1}`,step,"textarea",`data-week-step="${index}" ${past?'disabled':''}`,500)).join("")}</div></section>`;
  }

  function renderHabits() {
    const builtins = ["plank","pushups","water"];
    return `<h1>Привычки</h1><p class="muted">Выберите только те привычки, которые действительно хотите отслеживать.</p><div class="habit-grid">${state.habits.map((habit)=>`<article class="card"><h2>${esc(habit.name)}</h2><p>${habit.type==='simple'?'Простая привычка':habit.type==='plank'?'Таймер планки':habit.type==='pushups'?'Подходы отжиманий':'Трекер воды'}</p><p><strong>Расписание:</strong> ${habit.days.map((day)=>weekdayNames[day-1]).join(', ')||'не задано'}</p><p><strong>Цель:</strong> ${habit.goal||'отметка выполнения'}</p><button class="secondary" data-action="habit-toggle-active" data-id="${habit.id}">${habit.active===false?'Возобновить':'Пауза'}</button> <button class="link danger" data-action="habit-delete" data-id="${habit.id}">Удалить</button></article>`).join("")}</div><section class="panel"><h2>Добавить привычку</h2><div class="inline-form"><label class="field"><span>Название простой привычки</span><input id="habit-name" maxlength="80"></label><button data-action="habit-add-simple">Добавить простую привычку</button></div><h3>Встроенные трекеры</h3><div class="actions">${builtins.map((type)=>`<button class="secondary" data-action="habit-add-built" data-type="${type}" ${state.habits.some((h)=>h.type===type)?'disabled':''}>${type==='plank'?'Добавить планку':type==='pushups'?'Добавить отжимания':'Добавить воду'}</button>`).join("")}</div></section>`;
  }

  function renderProgress() {
    const habits = state.habits.filter((habit)=>habit.active!==false);
    return `<h1>Прогресс</h1><p class="muted">Пропуск — это информация, а не наказание.</p><div class="stats-grid">${habits.map((habit)=>{const dates=Object.keys(habit.records||{}).sort();const total=dates.reduce((sum,key)=>sum+totalFor(habit,key),0);const hits=dates.filter((key)=>completedHabit(habit,key)).length;const percent=dates.length?Math.round(hits/dates.length*100):0;const recent=Array.from({length:28},(_,index)=>addDays(todayKey(),index-27));return `<article class="card"><h2>${esc(habit.name)}</h2><div class="metric">${percent}%</div><p>Выполнено дней: ${hits} · записей: ${dates.length}</p><div class="bar" aria-label="Процент выполнения ${percent}"><span style="width:${percent}%"></span></div><p><strong>Всего:</strong> ${total}${habit.type==='plank'?' сек.':habit.type==='pushups'?' повторений':habit.type==='water'?' мл':''}</p><div class="calendar" aria-label="Последние 28 дней">${recent.map((key)=>`<span class="${completedHabit(habit,key)?'hit':''}" title="${prettyShort(key)}">${dateFromKey(key).getDate()}</span>`).join("")}</div></article>`;}).join("")||'<p class="empty">Добавьте привычку, чтобы увидеть прогресс.</p>'}</div>`;
  }

  function renderArchive() {
    const query = sessionStorage.getItem("archive-query") || ""; const rows = Object.entries(state.days).filter(([,day])=>JSON.stringify(day).toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru"))).sort(([a],[b])=>b.localeCompare(a));
    return `<h1>Архив</h1><section class="panel"><label class="field"><span>Что найти</span><input id="archive-query" value="${esc(query)}" placeholder="Поиск по записям"></label><div class="archive-results">${rows.map(([key,day])=>`<button class="archive-item" data-action="archive-open" data-date="${key}"><strong>${prettyDate(key)}</strong><span>${esc([day.result,day.thought,day.gratitude,day.tasks?.map((task)=>task.title).join(', ')].filter(Boolean).join(' · ').slice(0,240)||'Запись без текста')}</span></button>`).join("")||'<p class="empty">Подходящих записей пока нет.</p>'}</div></section>`;
  }

  function renderSettings() {
    return `<h1>Настройки</h1><div class="panel-grid"><section class="panel"><h2>Этот браузер</h2><p>Все записи хранятся только в локальном хранилище этого профиля браузера.</p><p>На другом компьютере или в другом профиле знакомство начнётся заново. Синхронизации нет.</p><label class="choice"><input type="checkbox" data-setting="pageTurn" ${state.settings.pageTurn?'checked':''}><span>Мягкая анимация переходов</span></label></section><section class="panel"><h2>Избранные цитаты</h2><p>Сохранено: ${state.quotePrefs.favorites.length}. Скрыто: ${state.quotePrefs.hidden.length}.</p><button class="secondary" data-action="quotes-restore">Вернуть скрытые цитаты</button></section><section class="panel danger-zone"><h2>Удалить все данные этого браузера</h2><p>Действие нельзя отменить. Данные Windows-приложения и других компьютеров не затрагиваются.</p><button class="danger" data-action="reset">Удалить все данные</button></section></div>`;
  }

  function updateOnboardingField(target) {
    const draft = state.onboarding.draft;
    if (target.dataset.onb) draft[target.dataset.onb] = target.type === "number" ? Number(target.value) : target.value;
    if (target.dataset.onbTracker) draft.trackers[target.dataset.onbTracker] = target.checked;
    if (target.dataset.onbGoal) draft.trackerGoals[target.dataset.onbGoal] = Number(target.value || 0);
    if (target.dataset.weekdayPrefix?.startsWith("onb-")) {
      const type = target.dataset.weekdayPrefix.slice(4); const key = type === "simple" ? "simpleDays" : null; const list = key ? draft[key] : draft.trackerDays[type]; const value = Number(target.value);
      const next = target.checked ? [...new Set([...list,value])].sort() : list.filter((item)=>item!==value); if (key) draft[key]=next; else draft.trackerDays[type]=next;
    }
    save();
  }
  function finishOnboarding() {
    const draft = state.onboarding.draft;
    const createBuilt = (type,name)=>({ id:uid(type), name, type, goal:Number(draft.trackerGoals[type]||1), days:draft.trackerDays[type].length?draft.trackerDays[type]:[1,2,3,4,5,6,7], records:{}, active:true });
    if (draft.trackers.plank && !state.habits.some((h)=>h.type==='plank')) state.habits.push(createBuilt('plank','Планка'));
    if (draft.trackers.pushups && !state.habits.some((h)=>h.type==='pushups')) state.habits.push(createBuilt('pushups','Отжимания'));
    if (draft.trackers.water && !state.habits.some((h)=>h.type==='water')) state.habits.push(createBuilt('water','Вода'));
    if (draft.simpleName.trim() && draft.simpleDays.length) state.habits.push({ id:uid('simple'), name:draft.simpleName.trim(), type:'simple', goal:1, days:draft.simpleDays, records:{}, active:true });
    if (draft.weeklyGoal.trim()) weekEntry(weekKey(todayKey())).goal = draft.weeklyGoal.trim();
    state.onboarding.complete = true; save(); render();
  }
  function cancelTimer() { if (!timer) return; clearInterval(timer.interval); timer=null; }
  function startPlank(id) {
    cancelTimer(); timer={habitId:id,phase:'countdown',remaining:3,elapsed:0,interval:null}; render();
    timer.interval=setInterval(()=>{ if (!timer) return; if (timer.phase==='countdown') { timer.remaining-=1; if (timer.remaining<=0) { timer.phase='running'; timer.started=Date.now(); timer.elapsed=0; } } else { timer.elapsed=Math.floor((Date.now()-timer.started)/1000); if (timer.elapsed>=600) { cancelTimer(); flash('Таймер превысил 10 минут и не засчитан.'); return; } } const node=document.querySelector('#timer-value'); if(node) node.textContent=String(timer.phase==='countdown'?timer.remaining:timer.elapsed); },1000);
  }
  function stopPlank() { if (!timer) return; const current=timer; cancelTimer(); if (current.phase==='running'&&current.elapsed>0) { const habit=state.habits.find((h)=>h.id===current.habitId); ensureRecords(habit); habit.records[todayKey()] = [...(habit.records[todayKey()]||[]),current.elapsed]; save(); flash('Подход планки сохранён.'); } else render(); }

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (target.matches("[data-onb],[data-onb-tracker],[data-onb-goal],[data-weekday-prefix]")) return updateOnboardingField(target);
    if (target.dataset.dayField) { const entry=dayEntry(selectedDate); const key=target.dataset.dayField; if(key.startsWith('reflection-')) entry.reflections[key.split('-')[1]]=target.value; else entry[key]=target.value; save(); }
    if (target.dataset.weekField) { weekEntry(selectedWeek)[target.dataset.weekField]=target.value; save(); }
    if (target.dataset.weekStep) { weekEntry(selectedWeek).steps[Number(target.dataset.weekStep)]=target.value; save(); }
    if (target.dataset.taskTitle!==undefined) { const task=dayEntry(selectedDate).tasks.find((item)=>item.id===target.closest('[data-task]').dataset.task); task.title=target.value; save(); }
    if (target.id==='archive-query') { sessionStorage.setItem('archive-query',target.value); render(); document.querySelector('#archive-query')?.focus(); }
  });
  document.addEventListener("change", (event) => {
    const target=event.target;
    if (target.matches("[data-onb],[data-onb-tracker],[data-onb-goal],[data-weekday-prefix]")) updateOnboardingField(target);
    const taskNode=target.closest?.('[data-task]'); const task=taskNode?dayEntry(selectedDate).tasks.find((item)=>item.id===taskNode.dataset.task):null;
    if (task&&target.dataset.taskCategory!==undefined) { task.category=target.value; save(); }
    if (task&&target.dataset.taskPriority!==undefined) { const priority=target.value?Number(target.value):null; if(priority) dayEntry(selectedDate).tasks.forEach((item)=>{if(item.id!==task.id&&item.priority===priority)item.priority=null;}); task.priority=priority; save(); render(); }
    if (target.dataset.setting) { state.settings[target.dataset.setting]=target.checked; save(); }
  });
  document.addEventListener("click", (event) => {
    const button=event.target.closest('[data-action]'); if(!button)return; const action=button.dataset.action;
    if(action==='nav'){event.preventDefault();cancelTimer();view=button.dataset.view;render();}
    if(action==='onb-next'){state.onboarding.step=Math.min(7,state.onboarding.step+1);save();render();}
    if(action==='onb-back'){state.onboarding.step=Math.max(1,state.onboarding.step-1);save();render();}
    if(action==='onb-skip'){const step=state.onboarding.step,d=state.onboarding.draft;if(step===2)d.weeklyPlanningWeekday=7;if(step===3)d.weeklyGoal='';if(step===4)d.trackers={plank:false,pushups:false,water:false};if(step===6){d.simpleName='';d.simpleDays=[];}state.onboarding.step=Math.min(7,step+1);save();render();}
    if(action==='onb-skip-all'){state.onboarding.complete=true;state.onboarding.draft=defaultDraft();save();render();}
    if(action==='onb-finish')finishOnboarding();
    if(action==='day-prev'){selectedDate=addDays(selectedDate,-1);render();}
    if(action==='day-next'){selectedDate=addDays(selectedDate,1);render();}
    if(action==='week-prev'){selectedWeek=addDays(selectedWeek,-7);render();}
    if(action==='week-next'){selectedWeek=addDays(selectedWeek,7);render();}
    if(action==='mood'){dayEntry(selectedDate).mood=button.dataset.value;save();render();}
    if(action==='quote-next'){dayEntry(selectedDate).quoteOffset=(dayEntry(selectedDate).quoteOffset||0)+1;save();render();}
    if(action==='quote-favorite'){const quote=quoteFor(selectedDate);const list=state.quotePrefs.favorites;state.quotePrefs.favorites=list.includes(quote.id)?list.filter((id)=>id!==quote.id):[...list,quote.id];save();render();}
    if(action==='quote-hide'){const quote=quoteFor(selectedDate);state.quotePrefs.hidden=[...new Set([...state.quotePrefs.hidden,quote.id])];save();render();}
    if(action==='task-add'){const input=document.querySelector('#new-task');if(!input.value.trim())return;dayEntry(selectedDate).tasks.push({id:uid('task'),title:input.value.trim(),category:document.querySelector('#new-category').value,priority:null,done:false});save();render();}
    if(action==='task-toggle'){const task=dayEntry(selectedDate).tasks.find((item)=>item.id===button.closest('[data-task]').dataset.task);task.done=button.checked;save();render();}
    if(action==='task-delete'){dayEntry(selectedDate).tasks=dayEntry(selectedDate).tasks.filter((item)=>item.id!==button.closest('[data-task]').dataset.task);save();render();}
    if(action==='finish-day'){dayEntry(selectedDate).closed=true;save();render();}
    if(action==='habit-simple'){const habit=state.habits.find((h)=>h.id===button.dataset.id);ensureRecords(habit);habit.records[selectedDate]=habit.records[selectedDate]?false:true;save();render();}
    if(action==='plank-start')startPlank(button.dataset.id);
    if(action==='plank-stop')stopPlank();
    if(action==='push-add'){const habit=state.habits.find((h)=>h.id===button.dataset.id);const input=document.querySelector(`#push-${CSS.escape(habit.id)}`);const value=Number(input.value);if(!Number.isInteger(value)||value<1||value>10000)return flash('Введите целое число от 1 до 10000.');ensureRecords(habit);habit.records[selectedDate]=[...(habit.records[selectedDate]||[]),value];save();render();}
    if(action==='water-add'){const habit=state.habits.find((h)=>h.id===button.dataset.id);ensureRecords(habit);habit.records[selectedDate]=[...(habit.records[selectedDate]||[]),Number(button.dataset.value)];save();render();}
    if(action==='habit-add-simple'){const input=document.querySelector('#habit-name');if(!input.value.trim())return;state.habits.push({id:uid('simple'),name:input.value.trim(),type:'simple',goal:1,days:[1,2,3,4,5,6,7],records:{},active:true});save();render();}
    if(action==='habit-add-built'){const type=button.dataset.type;const names={plank:'Планка',pushups:'Отжимания',water:'Вода'};const goals={plank:30,pushups:10,water:1500};state.habits.push({id:uid(type),name:names[type],type,goal:goals[type],days:[1,2,3,4,5,6,7],records:{},active:true});save();render();}
    if(action==='habit-toggle-active'){const habit=state.habits.find((h)=>h.id===button.dataset.id);habit.active=habit.active===false;save();render();}
    if(action==='habit-delete'){if(confirm('Удалить привычку и её записи?')){state.habits=state.habits.filter((h)=>h.id!==button.dataset.id);save();render();}}
    if(action==='archive-open'){selectedDate=button.dataset.date;view='Сегодня';render();}
    if(action==='quotes-restore'){state.quotePrefs.hidden=[];save();flash('Скрытые цитаты возвращены.');}
    if(action==='reset'){const phrase=prompt('Введите: УДАЛИТЬ ВСЕ ДАННЫЕ');if(phrase==='УДАЛИТЬ ВСЕ ДАННЫЕ'&&confirm('Удалить все записи этого браузера без возможности восстановления?')){localStorage.removeItem(STORAGE_KEY);sessionStorage.clear();state=defaultState();view='Сегодня';selectedDate=todayKey();render();}}
  });
  window.addEventListener('beforeunload',cancelTimer);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(()=>{});
  render();
})();
