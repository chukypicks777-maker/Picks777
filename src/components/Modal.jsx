import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
export default function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose?.(); }} className="picks-dialog">
    <header className="flex justify-between items-center gap-4 p-5 border-b border-white/10 sticky top-0 bg-[#0c1420] z-10">
      <h2 id={id} className="text-lg font-bold">{title}</h2>
      {onClose && <button className="control" aria-label="Cerrar ventana" onClick={onClose}><X size={18} /></button>}
    </header>
    <div className="p-5 sm:p-7">{children}</div>
  </dialog>;
}
