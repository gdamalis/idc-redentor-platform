import { ClockIcon, MapPinIcon } from "@heroicons/react/24/outline";
import { Container } from "@src/components/ui/container";
import { Typography } from "@src/components/ui/typography";

type CommunityEventProps = {
  content: {
    eventInfo: {
      name: string;
      dayOfWeek: string;
      date: string;
      time: string;
      note: string;
    };
    location: {
      addressLine1: string;
      neighborhood: string;
      city: string;
      country: string;
      mapEmbedUrl: string;
    };
  };
};

export const CommunityEvent = ({ content }: CommunityEventProps) => {
  return (
    <section className="py-20 sm:py-32 bg-white dark:bg-slate-900 transition-colors">
      <Container>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-24 lg:items-start">
          {/* Info Side */}
          <div className="space-y-10">
            <Typography
              component="h2"
              variant="h1"
              className="text-pretty"
            >
              {content.eventInfo.name}
            </Typography>

            {/* Service Times */}
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-primary-light/10 dark:text-primary-light">
                <ClockIcon className="h-6 w-6" />
              </div>
              <div>
                <Typography
                  component="h3"
                  variant="h4"
                  className="mb-1"
                >
                  {content.eventInfo.dayOfWeek}
                </Typography>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {content.eventInfo.time}
                </p>
                {content.eventInfo.note && (
                  <p className="mt-1 text-sm italic text-gray-500 dark:text-gray-400">
                    {content.eventInfo.note}
                  </p>
                )}
              </div>
            </div>

            {/* Location */}
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-primary-light/10 dark:text-primary-light">
                <MapPinIcon className="h-6 w-6" />
              </div>
              <div>
                <Typography
                  component="h3"
                  variant="h4"
                  className="mb-1"
                >
                  {content.location.addressLine1}
                </Typography>
                <p className="text-gray-600 dark:text-gray-400">
                  {content.location.neighborhood}, {content.location.city},{" "}
                  {content.location.country}
                </p>
              </div>
            </div>
          </div>

          {/* Map Side */}
          <div className="relative isolate overflow-hidden rounded-2xl shadow-lg ring-1 ring-gray-200 dark:ring-slate-700">
            <iframe
              src={content.location.mapEmbedUrl}
              className="h-[400px] w-full lg:h-[450px]"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              title='Mapa de la iglesia "Iglesia de Cristo"'
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </Container>
    </section>
  );
};
