import wormieLogo from '../assets/wormie-logo.png'

export function BrandLogo({ className }: { className?: string }): React.JSX.Element {
  return <img alt="" aria-hidden="true" className={className ? `brand-logo ${className}` : 'brand-logo'} draggable={false} src={wormieLogo} />
}
