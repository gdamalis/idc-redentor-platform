import { Typography } from "@src/components/ui/typography";
import { useTranslations } from "next-intl";

export const ContactInformationSection = () => {
  const t = useTranslations();

  return (
    <div className="overflow-hidden bg-white dark:bg-gray-900 py-20 sm:py-32">
      <div className="mx-auto max-w-7xl md:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-x-8 gap-y-16 sm:gap-y-20 lg:grid-cols-2 lg:items-start">
          <div className="px-6 lg:px-0 lg:pr-4">
            <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-lg">
              <Typography
                component="h2"
                variant="h2"
                className="mt-2 text-pretty text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl"
              >
                {t("contact-info-section.title")}
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
                    variant="body1"
                    className="text-2xl font-bold tracking-tight text-white"
                  >
                    {t("contact-info-section.date")}
                  </Typography>
                </div>
              </div>
              <Typography
                component="p"
                variant="body1"
                className="mt-2 text-sm italic text-gray-600"
              >
                {t("contact-info-section.date-comment")}
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
                    variant="body1"
                    className="text-2xl font-bold tracking-tight text-white"
                  >
                    {t("contact-info-section.address-line-1")}
                  </Typography>
                  <Typography
                    component="p"
                    variant="body1"
                    className="text-2xl tracking-tight text-white"
                  >
                    {t("contact-info-section.address-line-2")}
                  </Typography>
                </div>
              </div>
            </div>
          </div>
          <div className="sm:px-6 lg:px-0">
            <div className="relative isolate overflow-hidden sm:mx-auto sm:max-w-2xl sm:rounded-3xl lg:mx-0 lg:max-w-none">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d205.24589880502776!2d-58.428660275340235!3d-34.60582077587076!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x95bccba90ef56ead%3A0x76e96b1ea8cfa41!2sIglesia%20de%20Cristo%20Parque%20Centenario!5e0!3m2!1sen!2sar!4v1738971838553!5m2!1sen!2sar"
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
      </div>
    </div>
  );
};
