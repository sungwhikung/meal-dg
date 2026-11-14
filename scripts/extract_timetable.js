// hj-zio/nsdg-do-v1 의 src/modules/timetable.js 에서 2학년 3반 시간표만 뽑아 timetable.json 으로 저장한다.
// 사용법: node scripts/extract_timetable.js <timetable.js 경로>
"use strict";
const fs = require("fs");

const GRADE = 2;
const CLASS = 3;
const SECTION = "ABCDEFGH"[CLASS - 1]; // 공통 과목 분반 글자 (1반=A … 8반=H)
const ARTS_PAIR = CLASS % 2 ? [CLASS, CLASS + 1] : [CLASS - 1, CLASS]; // 음악/미술은 두 반이 함께 나뉜다
const CORE = ["문학", "미적분Ⅰ", "영어Ⅱ", "체육2"];
const ARTS = ["음악연주와창작", "미술창작"];
const DAYS = "ABCDE";

const source = fs.readFileSync(process.argv[2], "utf8");
const rows = JSON.parse(source.match(/const timetableData_2 = (\[.*?\]);?\s*\n/s)[1]);

// "정보과학1B" → { name: "정보과학1", letter: "B" }
const split = query => ({ name: query.slice(0, -1), letter: query.slice(-1) });
// 독서(논술) → 논술, 원본 오타 보정
const baseName = name => name.replace(/^독서\((.+)\)$/, "$1").replace(/^한국지리$/, "한국지리탐구");

const slots = {};
const groups = {};
for (const day of DAYS) {
  for (let period = 1; period <= 7; period++) {
    const symbol = day + period;
    const entries = rows.filter(row => row.symbol === symbol);
    if (!entries.length) continue;

    const plain = entries.find(row => row.class === CLASS && !/[A-H]$/.test(row.classQuery));
    const core = entries.find(row => CORE.includes(split(row.classQuery).name) && split(row.classQuery).letter === SECTION);
    const arts = entries.filter(row => ARTS.includes(split(row.classQuery).name) && ARTS_PAIR.includes(row.class));

    if (core) {
      slots[symbol] = { subject: split(core.classQuery).name, teacher: core.teacher };
    } else if (arts.length) {
      slots[symbol] = { group: "예술", options: Object.fromEntries(arts.map(row => [split(row.classQuery).name, { subject: split(row.classQuery).name, teacher: row.teacher }])) };
    } else if (plain) {
      slots[symbol] = { subject: plain.subject, teacher: plain.teacher === plain.subject ? "" : plain.teacher };
    } else {
      const letter = split(entries[0].classQuery).letter;
      if (!entries.every(row => split(row.classQuery).letter === letter)) throw new Error(`${symbol}: 선택 그룹이 섞여 있음`);
      slots[symbol] = { group: letter, options: Object.fromEntries(entries.map(row => {
        const name = split(row.classQuery).name;
        return [baseName(name), { subject: name.replace(/^한국지리$/, "한국지리탐구"), teacher: row.teacher }];
      })) };
    }
    const slot = slots[symbol];
    if (slot.group) groups[slot.group] = [...new Set([...(groups[slot.group] || []), ...Object.keys(slot.options)])];
  }
}

const output = { grade: GRADE, class: CLASS, source: "hj-zio/nsdg-do-v1", groups, slots };
fs.writeFileSync("timetable.json", JSON.stringify(output, null, 1) + "\n");
console.log(groups);
