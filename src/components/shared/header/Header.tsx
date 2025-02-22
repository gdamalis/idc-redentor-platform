import { useTranslations } from "next-intl";

type HeaderProps = {
  titlePath: string;
  description?: string;
  className?: string;
};

export const Header = ({ titlePath, description, className }: HeaderProps) => {
  const t = useTranslations();

  return (
    <div
      className={`bg-white/50 bg-cover bg-center py-24 bg-blend-overlay sm:py-48 ${className}`}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:mx-0">
          <h2 className="inline-block text-4xl/normal font-bold text-gray-900 sm:text-6xl">
            {t.rich(titlePath, {
              highlight: (text) => (
                <span className="animate-highlight bg-gradient-to-r from-yellow-300 to-yellow-300 bg-[length:0%_100%] bg-left-bottom bg-no-repeat px-2 [animation-delay:1s]">
                  {text}
                </span>
              ),
            })}
          </h2>
          {description && (
            <p className="mt-6 text-lg leading-8 text-gray-600">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
