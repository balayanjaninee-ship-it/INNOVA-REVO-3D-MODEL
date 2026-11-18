import { PANELCO_BRAND } from '../model/vehicleConfig';

interface PanelcoLogoProps {
  className?: string;
}

/**
 * Displays the official attached PANELCO III emblem cleanly framed around its
 * circular green seal (source canvas 595x500 with circle centered at 51.7%, 48.1%).
 */
export function PanelcoLogo({ className = 'h-12 w-12' }: PanelcoLogoProps) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
    >
      <img
        src={PANELCO_BRAND.logoUrl}
        alt="PANELCO III Official Seal"
        className="h-full w-full object-cover object-[51.7%_48.1%] scale-[1.15]"
        draggable={false}
      />
    </span>
  );
}
