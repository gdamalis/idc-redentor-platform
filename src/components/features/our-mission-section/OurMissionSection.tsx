import { HeartIcon } from "@heroicons/react/24/outline";
import Image from "next/image";

import { Typography } from "@src/components/ui/typography";

export const OurMissionSection = () => {
  return (
    <div className="relative isolate overflow-hidden bg-white px-6 py-24 sm:py-32 lg:overflow-visible lg:px-0">
      <div className="mx-auto grid max-w-2xl grid-cols-1 gap-x-8 gap-y-8 lg:mx-0 lg:max-w-none lg:grid-cols-2 lg:items-start lg:gap-y-6">
        <div className="lg:col-span-2 lg:col-start-1 lg:row-start-1 lg:mx-auto lg:grid lg:w-full lg:max-w-7xl lg:grid-cols-2 lg:gap-x-8 lg:px-8">
          <div className="lg:pr-4">
            <div className="lg:max-w-lg">
              <Typography
                component="h1"
                variant="h1"
                className="mt-2 text-pretty text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl"
              >
                Nuestra Misión
              </Typography>
            </div>
          </div>
        </div>
        <div className="-ml-12 -mt-12 p-12 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:overflow-hidden">
          <Image
            alt="Footsteps beach"
            src="/assets/img/footsteps_beachshore.jpg"
            width={768}
            height={432}
            className="w-[48rem] max-w-none rounded-xl bg-gray-900 shadow-xl ring-1 ring-gray-400/10 sm:w-[57rem]"
          />
        </div>
        <div className="lg:col-span-2 lg:col-start-1 lg:row-start-2 lg:mx-auto lg:grid lg:w-full lg:max-w-7xl lg:grid-cols-2 lg:gap-x-8 lg:px-8">
          <div className="lg:pr-4">
            <div className="max-w-xl text-base/7 text-gray-700 lg:max-w-lg">
              <Typography component="p" variant="body1">
                Ser la segunda encarnación después de Jesús. Queremos encarnar
                la vida y misión de Jesús aquí en la tierra.
              </Typography>
              <Typography component="p" variant="body1" className="mt-6">
                Queremos dar a conocer la buena nueva que Cristo nació, vivió,
                enseñó, murió, fue sepultado, resucitó y ascendió para reinar a
                la derecha de su Padre hasta su segunda aparición.
              </Typography>
              <Typography component="p" variant="body1" className="mt-6">
                El vuelve a redimir, a rescatar y renovar ésta, su buena
                creación. Queremos ser testigos de su poder y de su gran amor
                para la humanidad.
              </Typography>
              <ul className="mt-8 space-y-8 text-gray-600">
                <li className="flex gap-x-3">
                  <HeartIcon
                    aria-hidden="true"
                    className="mt-1 h-8 w-8 flex-none text-blue-600"
                  />
                  <span>
                    <strong className="font-semibold text-gray-900">
                      La predicación del evangelio .
                    </strong>{" "}
                    Lorem ipsum, dolor sit amet consectetur adipisicing elit.
                    Maiores impedit perferendis suscipit eaque, iste dolor
                    cupiditate blanditiis ratione.
                  </span>
                </li>
                <li className="flex gap-x-3">
                  <HeartIcon
                    aria-hidden="true"
                    className="mt-1 h-8 w-8 flex-none text-blue-600"
                  />
                  <span>
                    <strong className="font-semibold text-gray-900">
                      La vida comunitaria .
                    </strong>{" "}
                    Anim aute id magna aliqua ad ad non deserunt sunt. Qui irure
                    qui lorem cupidatat commodo.
                  </span>
                </li>
                <li className="flex gap-x-3">
                  <HeartIcon
                    aria-hidden="true"
                    className="mt-1 h-8 w-8 flex-none text-blue-600"
                  />
                  <span>
                    <strong className="font-semibold text-gray-900">
                      La misión .
                    </strong>{" "}
                    Ac tincidunt sapien vehicula erat auctor pellentesque
                    rhoncus. Et magna sit morbi lobortis.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
