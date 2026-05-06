-- 0032: seed the 128 manually-curated Container→SP category mappings.
-- Idempotent: keyed on container_label_normalized; pre-existing manual edits
-- (e.g. an operator override) are preserved by the WHERE m.source <> 'manual'
-- guard on the UPDATE side. Pure inserts are unconditional via UPSERT.
--
-- The reasoning column documents the choice for each mapping so the SP
-- merchandiser (and future operators) understand why a generic Container
-- label was bound to a particular SP leaf. For ambiguous Container labels
-- (e.g. "מקררים" — refrigerators), we pick the most common leaf type and
-- expect SP merchandiser per-product re-classification during catalog review.
--
-- Schema dependency: container_category_mappings (0030), categories (0001+
-- sp_category_code populated, 0029 is_leaf flag).

WITH mappings(label_norm, sp_code, reasoning) AS (VALUES
  -- High-volume generic labels mapped to most-common leaf
  ('מקררים',                      '55201500mp', 'generic→default leaf: מקרר מקפיא תחתון (most common type); SP merchandiser may re-classify per-product'),
  ('מאווררים',                    '55161200mp', 'generic→default leaf: מאוורר עומד (most common stand fan)'),
  ('תנורי אפיה',                  '55101500mp', 'generic→default leaf: תנורים משולבים (combined oven)'),
  ('כיריים',                      '55101100mp', 'generic→default leaf: כיריים גז (most common in IL)'),
  ('מדיחי כלים',                  '55131300mp', 'plural→singular: SP uses singular מדיח כלים'),
  ('מכונות כביסה',                '55131600mp', 'generic→default leaf: מכונות כביסה פתח קדמי (front-load common)'),
  ('טלויזיות',                    '55181000mp', 'exact match'),
  ('תנורים ומפזרי חום',           '55162300mp', 'space heaters (תנורים ומקרני חום)'),
  ('קולטי אדים',                  '55101300mp', 'plural→singular: SP uses singular קולט אדים'),
  ('מזגנים',                      '55161700mp', 'generic→default leaf: מזגן עילי (wall-mount common)'),
  ('מקפיאים',                     '55201000mp', 'exact match'),
  ('שואבי אבק',                   '55132000mp', 'generic→default leaf: שואבי אבק נגררים (canister vacuum)'),
  ('ספורט',                       '35192500mp', 'generic→default: סטים של מכשירים וציוד לכושר'),
  ('מייבשי כביסה',                '55131400mp', 'exact match'),
  ('טוסטרים',                     '55141300mp', 'generic→default leaf: טוסטר אובן (most common)'),
  ('שולחנות משחק',                '35221510mp', 'leaf: שולחנות כדורגל (foosball - most common game table)'),
  ('מיקרוגלים',                   '55141800mp', 'plural→singular: SP uses singular מיקרוגל'),
  ('ריהוט',                       '10213413mp', 'generic→default leaf: ספות (sofas — most common furniture; SP merchandiser may re-classify)'),
  ('משקולות',                     '35172220mp', 'leaf: סט משקולות (weight set)'),
  ('קומקומים ומיחמים',            '55142900mp', 'plural→singular: SP uses singular קומקומים'),
  ('מצננים',                      '55161600mp', 'closest leaf: מזגן נייד (portable cooler)'),
  ('מכשירי עיסוי',                '30231400mp', 'exact match — Health/Wellness massage devices'),
  ('צעצועים',                     '60132200mp', 'generic→default leaf: סטים למשחק'),
  ('מגהצים',                      '55131000mp', 'generic→default: מגהצי קיטור (steam irons most common)'),
  ('מוצרי כריסמיס',               '10201400mp', 'closest leaf: דקורציה לבית (home decoration)'),
  ('קוטל/דוחה יתושים',           '10181513mp', 'leaf: קטלני יתושים'),
  ('מיקסרים',                     '55141700mp', 'exact match'),
  ('מעבדי מזון',                  '55142300mp', 'exact match'),
  ('בלנדרים',                     '55141200mp', 'leaf: בלנדרים וקוצצי מזון'),
  ('קרוספיט',                     '35192500mp', 'leaf: סטים של מכשירים וציוד לכושר'),
  ('תאורה',                       '55271100mp', 'leaf: תאורה חכמה (smart lighting - most general)'),
  ('רדיאטורים',                   '55162200mp', 'plural→singular: SP uses singular רדיאטור'),
  ('גרילים מעשנות וטאבונים',     '55143100mp', 'leaf: גריל חשמלי (electric grill - default)'),
  ('מערכות שמע ניידות',           '55181416mp', 'leaf: רמקולים ניידים'),
  ('סירי בישול וטיגון',           '55142500mp', 'leaf: סירי בישול חשמליים (electric cooking pots)'),
  ('הליכונים',                    '35171100mp', 'leaf: הליכוני כושר (fitness treadmill)'),
  ('מקררי יין',                   '10161811mp', 'exact match (plural variant)'),
  ('מתקני תלייה',                 '10181224mp', 'leaf: מתלה כביסה (clothes hanging racks)'),
  ('אופני כושר',                  '35171011mp', 'exact match'),
  ('גלידה,פופקורן ועוד..',        '55142000mp', 'leaf: מכונת גלידה (ice cream machine)'),
  ('ציוד לחימה ואגרוף',           '35241010mp', 'leaf: כפפות אגרוף'),
  ('רמקולים',                     '55181410mp', 'leaf: רמקולים מדפיים (bookshelf — most common standalone)'),
  ('מכונות תספורת',               '55172300mp', 'exact match (machines + accessories)'),
  ('מסכי מחשב',                   '55151500mp', 'exact match'),
  ('כדורסל ואביזרים',             '35221513mp', 'leaf: מתקן קליעה כדורסל'),
  ('מסחטות',                      '55142200mp', 'leaf: מסחטות מיצים חשמליות'),
  ('מכונות גילוח',                '55171900mp', 'leaf: מכונות גילוח ועיצוב זקן'),
  ('מסכי  אויר',                  '55162600mp', 'closest leaf: ונטות ושואבי אוויר ביתיים (double-space preserved)'),
  ('ספות כושר',                   '35172218mp', 'exact match'),
  ('אוזניות',                     '55181511mp', 'leaf: אוזניות earbuds (most common)'),
  ('טלפונים',                     '55122010mp', 'leaf: טלפונים אלחוטיים (cordless)'),
  ('מוצרים לעיצוב שיער',          '55171800mp', 'leaf: אביזרים למעצבי שיער'),
  ('מטחנות',                      '55143700mp', 'leaf: מטחנות בשר (most common appliance grinder)'),
  ('מכונות שטיפה וטאטוא',         '55131800mp', 'closest leaf: שואבי אבק ושטיפה'),
  ('מקרן קול',                    '55181410mp', 'soundbar→closest: רמקולים מדפיים'),
  ('ציוד קמפינג',                 '35163000mp', 'leaf: שולחנות וכסאות קמפינג'),
  ('תיקים ומזוודות',              '40151811mp', 'leaf: מזוודות'),
  ('אביזרים למטבח',               '10161113mp', 'leaf: מערכות תליית כלי מטבח'),
  ('מוצרים לבית',                 '10201400mp', 'leaf: דקורציה לבית'),
  ('סוללות',                      '55231000mp', 'leaf: סוללות AA (most common type)'),
  ('מכונות קרח',                  '55201600mp', 'exact match (מכשיר להכנת קוביות קרח)'),
  ('אליפטיקלים',                  '35171400mp', 'exact match (אליפטיים)'),
  ('טרמפולינות',                  '60191600mp', 'exact match'),
  ('אופניים חשמליים',             '75101100mp', 'exact match'),
  ('מייבשי שיער',                 '55171300mp', 'exact match'),
  ('חשמל לרכב',                   '75151500mp', 'closest leaf: דיבורית לרכב (Bluetooth — representative car electrical)'),
  ('מכונות קפה',                  '55141900mp', 'exact match'),
  ('שעונים חכמים',                '55211000mp', 'exact match'),
  ('דגלים',                       '45162000mp', 'only flag-related leaf: דגלים ויום העצמאות'),
  ('כלי עבודה',                   '10131600mp', 'leaf: סט כלי עבודה'),
  ('כורסאות',                     '10213415mp', 'exact match'),
  ('מולטי טריינרים',              '35172300mp', 'exact match (מולטי טריינר)'),
  ('טאבלטים',                     '55111000mp', 'exact match'),
  ('טלפונים סלולריים',            '55121800mp', 'singular variant: סמארטפונים'),
  ('מטהר אויר',                   '55162700mp', 'exact match (מטהרי אוויר חשמליים)'),
  ('מקציף חלב',                   '55143000mp', 'exact match'),
  ('משקלים',                      '30221600mp', 'plural→singular: personal scales (משקל אדם)'),
  ('אביזרי חשמל',                 '55261011mp', 'leaf: רבי שקעים (power strips - most common electrical accessory)'),
  ('יוגה ופילאטיס',               '35151100mp', 'leaf: מזרני יוגה ופילאטיס'),
  ('כיבוי ומיגון',                '35181700mp', 'closest leaf: מיגון (protection)'),
  ('מסירי שיער',                  '15141313mp', 'leaf: אביזרים להסרת שיער בלייזר'),
  ('פלטה חשמלית',                 '55143100mp', 'closest leaf: גריל חשמלי (electric cooking surface)'),
  ('שואבי אוויר',                 '55162600mp', 'exact match (ונטות ושואבי אוויר ביתיים)'),
  ('כיסאות',                      '10213310mp', 'leaf: כסאות משרד ומנהלים (most common chair type)'),
  ('מקלדות',                      '55151700mp', 'exact match'),
  ('שונות למטבח',                 '10161217mp', 'closest leaf: סירים (kitchen pots representative)'),
  ('מתקני ייבוש כביסה',           '10181224mp', 'exact match (מתלה כביסה)'),
  ('קורקינטים',                   '75101300mp', 'leaf: קורקינט חשמלי'),
  ('אופה לחם',                    '55141000mp', 'exact match (אופי לחם — SP code; typo in label preserved)'),
  ('אינטרקום',                    '25101000mp', 'leaf: אינטרקום ומוניטור לתינוק'),
  ('ארון נעליים',                 '10213014mp', 'exact match'),
  ('גילוח ואביזרים',              '55171900mp', 'leaf: מכונות גילוח ועיצוב זקן'),
  ('מכשירי חתירה',                '35171300mp', 'exact match'),
  ('ממירים דיגיטליים',            '55181000mp', 'TV-related: maps to טלויזיות (no STB-specific leaf)'),
  ('מערכות סטריאו',               '55181410mp', 'leaf: רמקולים מדפיים (home stereo speakers)'),
  ('ציוד מטבח תעשייתי',           '55142500mp', 'closest: סירי בישול חשמליים (industrial = electric)'),
  ('ציוד משרדי',                  '45171600mp', 'leaf: נייר (general office paper)'),
  ('שולחנות מחשב',                '10213215mp', 'exact match'),
  ('כבלים ומתאמים',               '55251700mp', 'leaf: כבלי USB (most common cable)'),
  ('כדורגל',                      '35221110mp', 'leaf: כדורי כדורגל'),
  ('כספות',                       '10301100mp', 'exact match'),
  ('מייבשי ידיים ומתקני סבון',   '10231100mp', 'closest: מתלה מגבות (bathroom accessories)'),
  ('מכשירי גיהוץ וקיטור',         '55131000mp', 'exact match (מגהצי קיטור)'),
  ('מכשירי קשר',                  '60192500mp', 'leaf: מכשירי קשר ווקי טוקי'),
  ('משקפי מציאות מדומה',          '60291100mp', 'closest leaf: אוזניות גיימינג (gaming peripherals)'),
  ('פטריות חימום',                '55162400mp', 'exact match'),
  ('ציוד משלים לתקשורת אלחוטית', '55121400mp', 'leaf: כבלים ומטענים'),
  ('אביזרי גיהוץ',                '10181612mp', 'leaf: כיסויים לקרש גיהוץ'),
  ('אביזרים ומשחקים לקיץ',        '10121215mp', 'closest leaf: בריכות מתנפחות'),
  ('ארגזי כלים',                  '10142311mp', 'exact match'),
  ('בריכות ואביזרים',             '10121214mp', 'leaf: בריכות'),
  ('דיאטה ושמירת משקל',           '30301500mp', 'leaf: דיאטה'),
  ('דלתות ואביזרים',              '45191000mp', 'closest: אביזרים (no door-specific leaf)'),
  ('הדברה והרחקת מזיקים',         '10181511mp', 'leaf: חומרי הדברה לבית'),
  ('טוחני אשפה',                  '55143900mp', 'exact match'),
  ('מברשות שיניים',               '15161310mp', 'plural→singular adult: מברשות שיניים מבוגרים'),
  ('מגרסות נייר',                 '55151215mp', 'exact match (מגרסות)'),
  ('מוצרים לטיפוח הפנים',         '15101000mp', 'closest leaf: קרמי הגנה טיפוליים מהשמש (face care)'),
  ('מוצרים סולארים',              '10132500mp', 'leaf: פאנל סולארי'),
  ('מחמם מים',                    '10231200mp', 'closest: מחמם מגבות (no real water-heater leaf)'),
  ('מכונות לעיצוב זקן',           '55171900mp', 'leaf: מכונות גילוח ועיצוב זקן'),
  ('מקפצות',                      '60231400mp', 'closest leaf: צעצועי נדנדה וצעצועי קפיץ'),
  ('מקרנים',                      '55181300mp', 'exact match'),
  ('ציוד למחשבים',                '55151700mp', 'leaf: מקלדות (computer keyboards)'),
  ('קולר לשתיה',                  '55162000mp', 'exact match (קולר)'),
  ('שולחנות גיהוץ',               '10181610mp', 'exact match (קרש גיהוץ)'),
  ('שעוני דופק וספורט',           '35193400mp', 'exact match (שעוני ספורט)'),
  ('שעוני יד',                    '40133000mp', 'leaf: שעונים (women)')
)
INSERT INTO public.container_category_mappings AS m (
  container_label,
  container_label_normalized,
  category_id,
  sp_category_code,
  source,
  status,
  reasoning,
  product_count
)
SELECT
  mp.label_norm,
  mp.label_norm,
  c.id,
  c.sp_category_code,
  'manual',
  'approved',
  mp.reasoning,
  COALESCE((SELECT COUNT(*) FROM public.inventory i
              WHERE lower(btrim(coalesce(i.category, ''))) = mp.label_norm), 0)
FROM mappings mp
JOIN public.categories c
  ON c.sp_category_code = mp.sp_code AND coalesce(c.is_leaf, false) = true
ON CONFLICT (container_label_normalized) DO UPDATE
  SET sp_category_code = EXCLUDED.sp_category_code,
      category_id      = EXCLUDED.category_id,
      source           = 'manual',
      status           = 'approved',
      reasoning        = EXCLUDED.reasoning,
      product_count    = EXCLUDED.product_count,
      updated_at       = now()
  -- Don't clobber an existing manual mapping that someone else already
  -- approved with a different code on purpose.
  WHERE m.source <> 'manual'
     OR m.sp_category_code = EXCLUDED.sp_category_code;

-- Backfill inventory.category_id for any rows still NULL after seed.
SELECT public.backfill_inventory_category_id(false);
