export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <h1 className={`-rotate-3 font-black tracking-tight text-accent drop-shadow ${small ? 'text-2xl' : 'text-7xl'}`}>
        Psych<span className="text-psych">!</span>
      </h1>
      {!small && <p className="mt-2 text-indigo-300">Outwit your friends</p>}
    </div>
  );
}
