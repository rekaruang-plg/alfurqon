export const questionTypeLabels:Record<string,string>={PG:'Pilihan ganda',PG_KOMPLEKS:'Pilihan ganda kompleks / MCMA',ISIAN:'Isian singkat',URAIAN:'Esai / uraian',MENJODOHKAN:'Menjodohkan',BENAR_SALAH:'Benar / Salah'};
export const symbolSets:Record<string,string[]>={
 MATEMATIKA:'＋ − × ÷ = ≠ ≈ ± ∓ < > ≤ ≥ √ ∛ ² ³ ⁰ ¹ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ₀ ₁ ₂ ₃ ₄ ₅ ₆ ₇ ₈ ₉ ½ ⅓ ⅔ ¼ ¾ ⅛ ⅜ ⅝ ⅞ % ‰ π θ α β γ Δ ∞ ∑ ∏ ∫ ∂ ∈ ∉ ⊂ ⊆ ∪ ∩ ∅ ℕ ℤ ℚ ℝ ℂ ∀ ∃ ⇒ ⇔ ∠ ° ⊥ ∥ : !'.split(' '),
 FISIKA:'＋ − × ÷ = ≠ ≈ ± √ ² ³ ⁰ ¹ ⁴ ⁵ ⁻ ⁺ ₀ ₁ ₂ ₃ ₄ ₅ ° Δ δ λ μ ρ Ω ω α β γ θ φ ε η σ τ ν π ∞ ∑ ∫ ∂ ∇ → ← ↑ ↓ ↔ ∝ ℏ °C K N J W Pa Hz C V A T Wb F H eV'.split(' '),
 KIMIA:'₀ ₁ ₂ ₃ ₄ ₅ ₆ ₇ ₈ ₉ ⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ⁺ ⁻ + − = → ← ⇌ ⇋ ↔ ↑ ↓ Δ ° °C · × ⇝ α β γ λ μ mol pH (s) (l) (g) (aq)'.split(' '),
 ARAB:'ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي ء أ إ آ ة ى َ ُ ِ ْ ّ ً ٌ ٍ ٠ ١ ٢ ٣ ٤ ٥ ٦ ٧ ٨ ٩'.split(' ')
};

export function defaultQuestionPoints(type: string): number {
  if (type === 'PG') return 1;
  if (type === 'PG_KOMPLEKS') return 2;
  return 10;
}

import type {Question} from './model';

export function changeQuestionType(question: Question, kind: string, unit: string): Question {
  const previous = question.format || question.type;
  if (previous === kind) return question;
  const type = (kind === 'BENAR_SALAH' ? 'MENJODOHKAN' : kind) as Question['type'];
  const points = question.points === defaultQuestionPoints(previous)
    ? defaultQuestionPoints(kind)
    : question.points;
  const next = {...question, type, points, format: undefined, presentation: undefined};
  if (kind === 'BENAR_SALAH') {
    return {...next, format: kind, presentation:'KATEGORI', key:'', options:[], left:question.left?.length ? question.left : ['',''], right:['Benar','Salah']};
  }
  const choice = type === 'PG' || type === 'PG_KOMPLEKS';
  const wasChoice = question.type === 'PG' || question.type === 'PG_KOMPLEKS';
  if (choice && wasChoice && !question.format) {
    const key = type === 'PG' && question.key.includes(',') ? '' : question.key;
    return {...next, key};
  }
  if (choice) {
    // Misclassified Word questions may still contain their choices in the stem.
    const matches = [...question.text.matchAll(/(?:^|\n)[ \t]*(?:\*?([A-F])[.)]|[☐□☑✓✔])[ \t]+/gi)];
    const sequential = matches.every((match, index) =>
      matches[0][1] ? match[1]?.toUpperCase().charCodeAt(0) === 65 + index : !match[1]);
    const recovered = matches.length >= 2 && matches.length <= 6 && sequential
      ? matches.map((match, index) => question.text.slice(match.index! + match[0].length, matches[index+1]?.index).trim())
      : [];
    const stem = matches.length ? question.text.slice(0, matches[0].index).trim() : '';
    if (question.importSource && stem && recovered.length && recovered.every(Boolean)) {
      return {...next,text:stem,options:recovered,key:'',left:[],right:[]};
    }
    const options = question.options.some(value=>value.trim()) ? question.options : Array(unit==='SMA'?5:4).fill('');
    return {...next,options,key:'',left:[],right:[]};
  }
  if (type === 'MENJODOHKAN') return {...next,key:'',left:question.left?.length?question.left:['','',''],right:previous!=='BENAR_SALAH'&&question.right?.length?question.right:['','','']};
  return {...next,key:wasChoice || question.type==='MENJODOHKAN'?'':question.key};
}

export function questionSaveIssues(q: Question, unit: string, approved: boolean): string[] {
  const issues: string[] = [];
  if (!q.text?.trim() || q.text.includes('[ISI')) issues.push('pertanyaan belum lengkap');
  if (!Number.isFinite(q.points) || q.points <= 0) issues.push('poin maksimum harus lebih dari 0');
  if (q.stimulusId && !q.stimulus?.trim()) issues.push('bacaan bersambung belum diisi');
  if (!approved && q.importIssues?.length) issues.push('periksa dan setujui catatan impor');
  if (!approved && !q.key?.trim()) issues.push('isi kunci atau setujui koreksi manual');
  if (q.type === 'PG' || q.type === 'PG_KOMPLEKS') {
    if (q.options.length < 2) issues.push('isi minimal dua pilihan jawaban');
    const limit = unit === 'SMA' || q.type === 'PG_KOMPLEKS' ? 6 : 4;
    if (q.options.length > limit && q.format !== 'BENAR_SALAH') issues.push('maksimal '+limit+' pilihan untuk tipe ini');
    q.options.forEach((option,index)=>{if(!option.trim())issues.push('pilihan '+String.fromCharCode(65+index)+' kosong');});
    if (q.key?.trim()) {
      const keys = q.key.split(',');
      if ((q.type==='PG'&&keys.length!==1)||keys.some(key=>!/^\d+$/.test(key)||Number(key)>=q.options.length)) issues.push('pilih kunci dari opsi yang tersedia');
    }
  }
  if (q.type === 'MENJODOHKAN') {
    if (!q.left?.length || !q.right?.length) issues.push('isi butir kiri dan pilihan kanan');
    q.left?.forEach((text,index)=>{if(!text.trim())issues.push('butir kiri '+(index+1)+' kosong');});
    q.right?.forEach((text,index)=>{if(!text.trim())issues.push('pilihan kanan '+String.fromCharCode(65+index)+' kosong');});
    if (q.key?.trim()) {
      const keys=q.key.split(',');
      if (keys.length!==q.left?.length || keys.some(key=>!/^\d+$/.test(key.trim())||Number(key)>=(q.right?.length||0))) issues.push('lengkapi kunci pasangan untuk setiap butir');
    }
  }
  return issues;
}
