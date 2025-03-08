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
    <div className="overflow-hidden bg-white dark:bg-gray-900 py-20 sm:py-32 border-b border-gray-700/50">
      <Container>
        <div className="grid grid-cols-1 gap-x-8 gap-y-16 sm:gap-y-20 lg:grid-cols-2 lg:items-start">
          <div className="px-6 lg:px-0 lg:pr-4">
            <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-lg">
              <Typography
                component="h2"
                variant="h2"
                className="mt-2 text-pretty text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl"
              >
                {content.eventInfo.name}
              </Typography>
              <div className="relative mt-6 flex items-center px-6 py-8 sm:px-10 sm:py-12">
                <div className="absolute inset-0 overflow-hidden rounded-lg">
                  {/* <img
                    alt=""
                    src="https://tailwindui.com/plus-assets/img/ecommerce-images/footer-02-exclusive-sale.jpg"
                    className="size-full object-cover saturate-0 filter"
                  /> */}
                  <div className="absolute inset-0 bg-blue-800/90" />
                </div>
                <div className="relative mx-auto max-w-sm text-center">
                  <Typography
                    component="p"
                    variant="h3"
                    className="font-bold tracking-tight text-white"
                  >
                    {content.eventInfo.dayOfWeek} | {content.eventInfo.time}
                  </Typography>
                </div>
              </div>
              <Typography
                component="p"
                variant="body1"
                className="mt-2 text-sm italic text-gray-600"
              >
                {content.eventInfo.note}
              </Typography>
              <div className="relative mt-6 flex items-center px-6 py-12 sm:px-10 sm:py-16">
                <div className="absolute inset-0 overflow-hidden rounded-lg">
                  {/* <img
                    alt=""
                    src="https://tailwindui.com/plus-assets/img/ecommerce-images/footer-02-exclusive-sale.jpg"
                    className="size-full object-cover saturate-0 filter"
                  /> */}
                  <div className="absolute inset-0 bg-blue-600/90" />
                </div>
                <div className="relative mx-auto max-w-sm text-center">
                  <Typography
                    component="p"
                    variant="h3"
                    className="font-bold tracking-tight text-white"
                  >
                    {content.location.addressLine1}
                  </Typography>
                  <Typography
                    component="p"
                    variant="body1"
                    className="tracking-tight text-white"
                  >
                    {content.location.neighborhood}, {content.location.city},{" "}
                    {content.location.country}
                  </Typography>
                </div>
              </div>
            </div>
          </div>
          <div className="sm:px-6 lg:px-0">
            <div className="relative isolate overflow-hidden sm:mx-auto sm:max-w-2xl sm:rounded-3xl lg:mx-0 lg:max-w-none">
              <iframe
                src={content.location.mapEmbedUrl}
                width="600"
                height="450"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                title='Mapa de la iglesia "Iglesia de Cristo"'
                referrerPolicy="no-referrer-when-downgrade"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/10 sm:rounded-3xl"
              />
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
};
