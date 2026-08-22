export const SEED_VERSION = 1;

export const reflectionPrompts = [
  { id: "RP-F01", kind: "FIXED", orderIndex: 1, textRu: "Что вчера получилось или порадовало меня?" },
  { id: "RP-F02", kind: "FIXED", orderIndex: 2, textRu: "Что осталось незавершённым и по-прежнему действительно важно?" },
  { id: "RP-F03", kind: "FIXED", orderIndex: 3, textRu: "Что я могу сегодня сделать немного проще или лучше?" },
  { id: "RP-R01", kind: "ROTATING", orderIndex: null, textRu: "Что вчера дало мне энергию?" },
  { id: "RP-R02", kind: "ROTATING", orderIndex: null, textRu: "Что забрало у меня больше всего сил?" },
  { id: "RP-R03", kind: "ROTATING", orderIndex: null, textRu: "Удалось ли мне уделить время себе?" },
  { id: "RP-R04", kind: "ROTATING", orderIndex: null, textRu: "Как я проявил внимание к близкому человеку?" },
  { id: "RP-R05", kind: "ROTATING", orderIndex: null, textRu: "За что я могу поблагодарить себя?" },
  { id: "RP-R06", kind: "ROTATING", orderIndex: null, textRu: "Какой момент вчерашнего дня я хочу запомнить?" },
  { id: "RP-R07", kind: "ROTATING", orderIndex: null, textRu: "Что я понял о себе?" },
  { id: "RP-R08", kind: "ROTATING", orderIndex: null, textRu: "От какой необязательной задачи я могу отказаться?" },
  { id: "RP-R09", kind: "ROTATING", orderIndex: null, textRu: "Где я взял на себя больше, чем мог выполнить?" },
  { id: "RP-R10", kind: "ROTATING", orderIndex: null, textRu: "Какой небольшой выбор приблизил меня к цели недели?" }
] as const;

type Source = {
  author: string;
  workTitle: string;
  workYear: number;
  yearKind: "PUBLICATION" | "FIRST_PERFORMANCE";
  sourceUrl: string;
};

const sources: Record<string, Source> = {
  "SRC-01": { author: "Jerome K. Jerome", workTitle: "Three Men in a Boat (To Say Nothing of the Dog)", workYear: 1889, yearKind: "PUBLICATION", sourceUrl: "https://www.gutenberg.org/files/308/308-h/308-h.htm" },
  "SRC-02": { author: "Oscar Wilde", workTitle: "The Importance of Being Earnest", workYear: 1895, yearKind: "FIRST_PERFORMANCE", sourceUrl: "https://www.gutenberg.org/files/844/844-h/844-h.htm" },
  "SRC-03": { author: "Ambrose Bierce", workTitle: "The Devil’s Dictionary", workYear: 1911, yearKind: "PUBLICATION", sourceUrl: "https://www.gutenberg.org/files/972/972-h/972-h.htm" },
  "SRC-04": { author: "Mark Twain", workTitle: "The Tragedy of Pudd’nhead Wilson", workYear: 1894, yearKind: "PUBLICATION", sourceUrl: "https://www.gutenberg.org/files/102/102-h/102-h.htm" },
  "SRC-05": { author: "Benjamin Franklin", workTitle: "The Way to Wealth", workYear: 1758, yearKind: "PUBLICATION", sourceUrl: "https://www.gutenberg.org/files/40236/40236-h/40236-h.htm" },
  "SRC-06": { author: "Ralph Waldo Emerson", workTitle: "Essays: First Series", workYear: 1841, yearKind: "PUBLICATION", sourceUrl: "https://www.gutenberg.org/files/16643/16643-h/16643-h.htm" },
  "SRC-07": { author: "Henry David Thoreau", workTitle: "Walden", workYear: 1854, yearKind: "PUBLICATION", sourceUrl: "https://www.gutenberg.org/files/205/205-h/205-h.htm" },
  "SRC-08": { author: "Francis Bacon", workTitle: "The Essays or Counsels, Civil and Moral, final authorial edition", workYear: 1625, yearKind: "PUBLICATION", sourceUrl: "https://www.gutenberg.org/files/575/575-h/575-h.htm" },
  "SRC-09": { author: "John Stuart Mill", workTitle: "On Liberty", workYear: 1859, yearKind: "PUBLICATION", sourceUrl: "https://www.gutenberg.org/files/34901/34901-h/34901-h.htm" },
  "SRC-10": { author: "G. K. Chesterton", workTitle: "Orthodoxy", workYear: 1908, yearKind: "PUBLICATION", sourceUrl: "https://www.gutenberg.org/cache/epub/130/pg130-images.html" }
};

type QuoteRow = readonly [id: string, sourceId: string, translationRu: string, sourceExcerpt: string, locator: string];

const humor: readonly QuoteRow[] = [
  ["Q-H01", "SRC-01", "В тот читальный зал я вошёл счастливым и здоровым человеком. Выполз оттуда дряхлой развалиной.", "…a happy, healthy man…", "Chapter I"],
  ["Q-H02", "SRC-01", "Удивительный факт: на суше морской болезнью никто никогда не страдает.", "…nobody ever is sea-sick…", "Chapter I"],
  ["Q-H03", "SRC-01", "Я заметил, что в этом мире мало что вполне соответствует своим изображениям.", "…the pictures of them…", "Chapter XIX"],
  ["Q-H04", "SRC-01", "Я люблю работу: она меня завораживает. Я могу часами сидеть и смотреть на неё.", "I like work…", "Chapter XV"],
  ["Q-H05", "SRC-01", "Нужно думать не о том, что нам пригодилось бы, а лишь о том, без чего нам не обойтись.", "…things that we can’t do without.", "Chapter III"],
  ["Q-H06", "SRC-01", "В Харрисе нет поэзии — никакой безудержной тоски по недостижимому.", "…yearning for the unattainable.", "Chapter II"],
  ["Q-H07", "SRC-02", "Правда редко бывает чистой и никогда — простой.", "…rarely pure and never simple.", "Act I"],
  ["Q-H08", "SRC-02", "Я никогда не путешествую без дневника. В поезде всегда нужно читать что-нибудь сенсационное.", "…something sensational to read…", "Act II"],
  ["Q-H09", "SRC-02", "Все женщины становятся похожи на своих матерей. В этом их трагедия. Ни один мужчина не становится. В этом — его.", "That is their tragedy.", "Act I"],
  ["Q-H10", "SRC-02", "В делах большой важности решающее значение имеет стиль, а не искренность.", "…style, not sincerity…", "Act III"],
  ["Q-H11", "SRC-02", "Потерю одного родителя, мистер Уортинг, можно счесть несчастьем; потеря обоих уже похожа на небрежность.", "…looks like carelessness.", "Act I"],
  ["Q-H12", "SRC-02", "Терпеть не могу людей, которые несерьёзно относятся к еде. Это так поверхностно с их стороны.", "…serious about meals.", "Act I"],
  ["Q-H13", "SRC-03", "ПРИВЫЧКА, сущ. Оковы свободного человека.", "…shackle for the free.", "entry HABIT"],
  ["Q-H14", "SRC-03", "БУДУЩЕЕ, сущ. Период времени, когда наши дела процветают, друзья верны, а счастье обеспечено.", "…our happiness is assured.", "entry FUTURE"],
  ["Q-H15", "SRC-03", "ТЕРПЕНИЕ, сущ. Незначительная форма отчаяния, замаскированная под добродетель.", "…disguised as a virtue.", "entry PATIENCE"],
  ["Q-H16", "SRC-03", "ОПЫТ, сущ. Мудрость, позволяющая узнать в нежелательном старом знакомом глупость, которую мы уже однажды обняли.", "…an undesirable old acquaintance…", "entry EXPERIENCE"],
  ["Q-H17", "SRC-03", "НАСТОЙЧИВОСТЬ, сущ. Скромная добродетель, с помощью которой посредственность достигает бесславного успеха.", "…mediocrity achieves an inglorious success.", "entry PERSEVERANCE"],
  ["Q-H18", "SRC-03", "НАПОР, сущ. Одна из двух вещей, главным образом ведущих к успеху, особенно в политике. Вторая — протекция.", "The other is Pull.", "entry PUSH"],
  ["Q-H19", "SRC-04", "Мало что труднее вынести, чем раздражение от хорошего примера.", "…annoyance of a good example.", "Chapter XIX calendar"],
  ["Q-H20", "SRC-04", "Лучше бы нам не думать одинаково: именно разница мнений устраивает скачки.", "…difference of opinion…", "Chapter XIX calendar"],
  ["Q-H21", "SRC-04", "Ничто так не нуждается в исправлении, как привычки других людей.", "…other people’s habits.", "Chapter XV calendar"],
  ["Q-H22", "SRC-04", "Сложите все яйца в одну корзину — и следите за этой корзиной.", "…watch that basket.", "Chapter XV calendar"],
  ["Q-H23", "SRC-04", "Воспитание — всё. Персик когда-то был горьким миндалём, а цветная капуста — всего лишь капуста с высшим образованием.", "…cabbage with a college education.", "Chapter V calendar"],
  ["Q-H24", "SRC-04", "Привычка есть привычка: её не выбросишь из окна — её приходится шаг за шагом уговаривать спуститься по лестнице.", "…coaxed down-stairs…", "Chapter VI calendar"]
];

const motivation: readonly QuoteRow[] = [
  ["Q-M01", "SRC-05", "Потерянного времени больше не найти.", "Lost time…", "The Way to Wealth"],
  ["Q-M02", "SRC-05", "Усердие — мать удачи.", "…mother of luck.", "The Way to Wealth"],
  ["Q-M03", "SRC-05", "Один сегодняшний день стоит двух завтрашних.", "One to-day…", "The Way to Wealth"],
  ["Q-M04", "SRC-05", "Не откладывай до завтра то, что можешь сделать сегодня.", "Never leave that till to-morrow…", "The Way to Wealth"],
  ["Q-M05", "SRC-05", "Без труда нет и плодов.", "…no gains without pains.", "The Way to Wealth"],
  ["Q-M06", "SRC-05", "Малые удары валят большие дубы.", "Little strokes…", "The Way to Wealth"],
  ["Q-M07", "SRC-06", "Доверяй себе: каждое сердце отзывается на эту железную струну.", "Trust thyself…", "Self-Reliance"],
  ["Q-M08", "SRC-06", "Ничто не принесёт вам покоя, кроме вас самих.", "…peace but yourself.", "Self-Reliance"],
  ["Q-M09", "SRC-06", "Настаивайте на своём; не подражайте.", "…never imitate.", "Self-Reliance"],
  ["Q-M10", "SRC-06", "Человек чувствует облегчение и радость, когда вкладывает сердце в работу и делает всё, что может; всё сказанное или сделанное иначе не даст ему покоя.", "…put his heart into his work…", "Self-Reliance"],
  ["Q-M11", "SRC-06", "Закон природы таков: сделай дело — и обретёшь силу; кто не делает, тот силы не получает.", "Do the thing…", "Compensation"],
  ["Q-M12", "SRC-06", "Отличительная черта подлинного героизма — постоянство.", "…genuine heroism is its persistency.", "Heroism"],
  ["Q-M13", "SRC-07", "Я ушёл в лес, потому что хотел жить осознанно, иметь дело лишь с важнейшими фактами жизни, узнать, чему она может меня научить, и не обнаружить перед смертью, что я так и не жил.", "…live deliberately…", "Where I Lived, and What I Lived For"],
  ["Q-M14", "SRC-07", "Упрощай, упрощай.", "Simplify, simplify.", "Where I Lived, and What I Lived For"],
  ["Q-M15", "SRC-07", "Если человек уверенно движется к своей мечте и старается жить той жизнью, которую вообразил, успех придёт в самый неожиданный час.", "…direction of his dreams…", "Conclusion"],
  ["Q-M16", "SRC-07", "Какой бы скромной ни была ваша жизнь, встретьте её и живите; не избегайте её и не обзывайте тяжёлыми словами.", "…meet it and live it…", "Conclusion"],
  ["Q-M17", "SRC-07", "Рассвет приходит лишь к тому дню, к которому мы пробудились.", "Only that day dawns…", "Conclusion"],
  ["Q-M18", "SRC-07", "Человек богат соразмерно числу вещей, которые может позволить себе оставить в покое.", "…afford to let alone.", "Economy"]
];

const philosophy: readonly QuoteRow[] = [
  ["Q-P01", "SRC-08", "Чтение делает человека знающим; беседа — находчивым; письмо — точным.", "Reading maketh a full man…", "Of Studies"],
  ["Q-P02", "SRC-08", "Одни книги следует попробовать, другие — проглотить, а немногие — разжевать и переварить.", "…chewed and digested.", "Of Studies"],
  ["Q-P03", "SRC-08", "Мудрый человек создаёт больше возможностей, чем находит.", "…make more opportunities…", "Of Ceremonies and Respects"],
  ["Q-P04", "SRC-08", "Месть — разновидность дикой справедливости.", "…wild justice.", "Of Revenge"],
  ["Q-P05", "SRC-08", "Деньги подобны навозу: не приносят пользы, пока их не разбрасывают.", "Money is like muck…", "Of Seditions and Troubles"],
  ["Q-P06", "SRC-08", "Обычай — главный правитель человеческой жизни.", "…principal magistrate of man’s life.", "Of Custom and Education"],
  ["Q-P07", "SRC-09", "Единственная свобода, заслуживающая этого имени, — искать собственное благо собственным путём, пока мы не лишаем других их блага и не мешаем их стремлению к нему.", "…pursuing our own good…", "Chapter I"],
  ["Q-P08", "SRC-09", "Кто знает лишь свою сторону дела, знает о нём мало.", "…knows little of that.", "Chapter II"],
  ["Q-P09", "SRC-09", "Если бы всё человечество, кроме одного человека, придерживалось одного мнения, оно имело бы не больше права заставить его молчать, чем он — всё человечество.", "…all mankind minus one…", "Chapter II"],
  ["Q-P10", "SRC-09", "Гений может свободно дышать лишь в атмосфере свободы.", "…atmosphere of freedom.", "Chapter III"],
  ["Q-P11", "SRC-09", "Тому, кто позволяет миру выбрать за него жизненный план, не нужна никакая способность, кроме обезьяньего подражания.", "…ape-like one of imitation.", "Chapter III"],
  ["Q-P12", "SRC-09", "Роковая склонность людей переставать думать о вещи, как только она перестаёт вызывать сомнения, — причина половины их ошибок.", "…cause of half their errors.", "Chapter II"],
  ["Q-P13", "SRC-10", "Ангелы умеют летать, потому что умеют легко относиться к себе.", "…take themselves lightly.", "The Romance of Orthodoxy"],
  ["Q-P14", "SRC-10", "Быть тяжёлым легко; трудно быть лёгким.", "…hard to be light.", "The Romance of Orthodoxy"],
  ["Q-P15", "SRC-10", "Безумец — не тот, кто потерял разум. Безумец — тот, кто потерял всё, кроме разума.", "…lost everything except his reason.", "The Maniac"],
  ["Q-P16", "SRC-10", "Поэт лишь просит позволить ему поднять голову к небесам. Логик пытается вместить небеса в свою голову.", "…head into the heavens.", "The Maniac"],
  ["Q-P17", "SRC-10", "Традиция даёт голос самому незаметному классу — нашим предкам. Это демократия мёртвых.", "…democracy of the dead.", "The Ethics of Elfland"],
  ["Q-P18", "SRC-10", "Взрослые просто недостаточно сильны, чтобы радоваться однообразию.", "…exult in monotony.", "The Ethics of Elfland"]
];

function materialize(category: "HUMOR" | "MOTIVATION" | "PHILOSOPHY", rows: readonly QuoteRow[]) {
  return rows.map(([id, sourceId, translationRu, sourceExcerpt, locator]) => {
    const source = sources[sourceId];
    if (!source) throw new Error(`Unknown quote source: ${sourceId}`);
    return {
      id,
      category,
      ...source,
      translationRu,
      sourceExcerpt,
      sourceLanguage: "en",
      locator,
      builtIn: true,
      seedVersion: SEED_VERSION
    } as const;
  });
}

export const quotes = [
  ...materialize("HUMOR", humor),
  ...materialize("MOTIVATION", motivation),
  ...materialize("PHILOSOPHY", philosophy)
];

export const EXPECTED_PROMPTS_SHA256 = "f6eecce6192fa20d6045f1d9a49b5348c1988e5cdb933f7861b818de8a6e332c";
export const EXPECTED_QUOTES_SHA256 = "c297b0041a310615279f2617991c16b00cbbeff38efdcad437bfb13848c100fa";
