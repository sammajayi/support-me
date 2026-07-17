export default function WalletInfo({ address, balance }) {
  const short = address
    ? address.slice(0, 6) + '…' + address.slice(-4)
    : '—'

  return (
    <div className="card-brutal px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-widest text-ink">
          Address
        </span>
        <span className="font-mono text-[13px] text-muted">{short}</span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-widest text-ink">
          Balance
        </span>
        <span className="bg-brand-lime text-ink border-2 border-ink rounded-full px-3 py-0.5 text-[13px] font-bold font-mono whitespace-nowrap">
          {balance !== null ? `${balance} XLM` : 'Loading…'}
        </span>
      </div>
    </div>
  )
}
