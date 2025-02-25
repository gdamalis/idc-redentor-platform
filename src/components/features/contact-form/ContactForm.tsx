import Image from "next/image";
import { Typography } from "@src/components/ui/typography";
import { Dropdown, type DropDownOption } from "@src/components/ui/dropdown";
import { Link } from "@src/i18n/routing";

const DropDownOptions: DropDownOption[] = [
  {
    id: "1",
    value: "Petición de Oración",
  },
  {
    id: "2",

    value: "Solicitud de Información",
  },
  {
    id: "3",
    value: "Solicitud de Bautismo",
  },
  {
    id: "5",
    value: "Solicitud de Consejería",
  },
  {
    id: "6",
    value: "Solicitud de Ayuda",
  },
  {
    id: "8",
    value: "Quier visitarlos",
  },
];

export const ContactForm = () => {
  return (
    <div className="relative isolate bg-white dark:bg-gray-900 px-6 py-20 sm:py-32 lg:px-8">
      <div className="mx-auto max-w-xl lg:max-w-4xl">
        <Typography
          component="h2"
          variant="h2" className="text-pretty text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
          Conectá con nosotros{" "}
        </Typography>
        <Typography
          component="p"
          variant="body1"
          className="mt-4 text-lg/8 text-gray-600"
        >
          Podés escribirnos al correo{" "}
          <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-lg font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10">
            idcredentor@gmail.com
          </span>{" "}
          o bien podés escribirnos a través de este breve formulario:
        </Typography>
        <div className="mt-8 flex flex-col gap-16 sm:gap-y-20 lg:flex-row">
          <form action="#" method="POST" className="lg:flex-auto">
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="first-name"
                  className="block text-sm/6 font-semibold text-gray-900"
                >
                  First name
                </label>
                <div className="mt-2.5">
                  <input
                    id="first-name"
                    name="first-name"
                    type="text"
                    autoComplete="given-name"
                    className="block w-full rounded-md bg-white px-3.5 py-2 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="last-name"
                  className="block text-sm/6 font-semibold text-gray-900"
                >
                  Last name
                </label>
                <div className="mt-2.5">
                  <input
                    id="last-name"
                    name="last-name"
                    type="text"
                    autoComplete="family-name"
                    className="block w-full rounded-md bg-white px-3.5 py-2 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="budget"
                  className="block text-sm/6 font-semibold text-gray-900"
                >
                  Razón de contacto
                </label>
                <div className="mt-2.5">
                  <Dropdown options={DropDownOptions} />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="message"
                  className="block text-sm/6 font-semibold text-gray-900"
                >
                  Mensaje
                </label>
                <div className="mt-2.5">
                  <textarea
                    id="message"
                    name="message"
                    rows={4}
                    className="block w-full rounded-md bg-white px-3.5 py-2 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600"
                    defaultValue={""}
                  />
                </div>
              </div>
            </div>
            <div className="mt-10">
              <button
                type="submit"
                className="block w-full rounded-md bg-blue-600 px-3.5 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Let’s talk
              </button>
            </div>
            <Typography
              component="p"
              variant="body1"
              className="mt-4 text-sm/6 text-gray-500"
            >
              Al enviar este formulario, aceptás la{" "}
              <Link
                href="/privacy-policy"
                className="font-semibold text-blue-600"
              >
                política de privacidad
              </Link>{" "}
              .
            </Typography>
          </form>
          <div className="lg:mt-6 lg:w-80 lg:flex-none">
            <Image
              src="/assets/img/redentor_logo.png"
              className="h-24 w-24 dark:invert dark:mix-blend-luminosity"
              width={60}
              height={80}
              alt="Redentor church logo"
            />
            <figure className="mt-4">
              <blockquote className="text-lg/8 font-semibold italic text-gray-900">
                <Typography component="p" variant="body1">
                  &quot;Tú eres el Cristo, el Hijo del Dios viviente.&quot;
                </Typography>
              </blockquote>
              <figcaption className="mt-4 flex gap-x-6">
                <div>
                  <div className="text-base font-semibold text-gray-900">
                    Mateo 16:16
                  </div>
                </div>
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
    </div>
  );
};
