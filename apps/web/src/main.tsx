import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const modules = [
  ['📊', 'Bosh sahifa', 'Umumiy ko‘rsatkichlar va ogohlantirishlar'],
  ['📦', 'Xomashyo ombori', 'Kirim, sarf va qoldiq'],
  ['🏭', 'Ishlab chiqarish', 'Retsept va mahsulot chiqarish'],
  ['🚚', 'Dilerlar', 'Yuklar, to‘lov va qarzlar'],
  ['💰', 'Kassa va xarajatlar', 'Pul harakati va sarf'],
  ['👥', 'Ishchilar', 'Davomat, avans va oylik'],
  ['📑', 'Hisobotlar', 'Excel eksport va solishtirish'],
];
function App() {
  return <main><header><div><p className="eyebrow">FACTORY MANAGEMENT</p><h1>ECO WASH <span>ERP</span></h1><p>Korxona boshqaruvi uchun yagona tizim</p></div><div className="status">◌ Boshlang‘ich development versiyasi</div></header><section><div className="intro"><h2>Boshqaruv paneli</h2><p>Hozircha demo navigatsiya. Real pul va ombor amallari backend xavfsizlik testlaridan so‘ng ulanadi.</p></div><div className="cards">{modules.map(([emoji,title,detail])=><article key={title}><span className="emoji">{emoji}</span><h3>{title}</h3><p>{detail}</p><span className="soon">Ishlab chiqilmoqda →</span></article>)}</div></section></main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
