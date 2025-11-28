"use client";

import Image from "next/image";

type PhotoGridProps = {
  images: Array<{
    url: string;
    title: string;
    width?: number;
    height?: number;
  }>;
  caption?: string;
};

export const PhotoGrid = ({ images, caption }: PhotoGridProps) => {
  if (!images || images.length === 0) {
    return null;
  }

  // Ensure we have at least 4 images for the grid layout
  const gridImages = images.slice(0, 4);
  
  return (
    <section className="py-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 h-96 md:h-[500px] rounded-3xl overflow-hidden">
          {/* Large featured image - spans 2 columns and 2 rows */}
          {gridImages[0] && (
            <div className="col-span-2 row-span-2 relative group">
              <Image 
                src={gridImages[0].url}
                alt={gridImages[0].title}
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              {caption && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-8">
                  <p className="text-white font-serif text-2xl font-bold">{caption}</p>
                </div>
              )}
            </div>
          )}
          
          {/* Small top-right image - 1 column, 1 row */}
          {gridImages[1] && (
            <div className="col-span-1 row-span-1 relative group">
              <Image 
                src={gridImages[1].url}
                alt={gridImages[1].title}
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 768px) 50vw, 25vw"
              />
            </div>
          )}
          
          {/* Tall right image - 1 column, 2 rows */}
          {gridImages[2] && (
            <div className="col-span-1 row-span-2 relative group">
              <Image 
                src={gridImages[2].url}
                alt={gridImages[2].title}
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 768px) 50vw, 25vw"
              />
            </div>
          )}
          
          {/* Small bottom image - 1 column, 1 row */}
          {gridImages[3] && (
            <div className="col-span-1 row-span-1 relative group">
              <Image 
                src={gridImages[3].url}
                alt={gridImages[3].title}
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 768px) 50vw, 25vw"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

