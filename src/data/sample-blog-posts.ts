import { BlogPost } from '@src/types/BlogPost';

export const dummyBlogPosts: BlogPost[] = [
  {
    id: 1,
    title: 'El poder de la oración en tiempos difíciles',
    description:
      'Descubrí cómo la oración puede fortalecer tu fe y brindarte paz en los momentos de mayor desafío.',
    content:
      'En este artículo, exploramos el impacto de la oración en la vida de los creyentes, especialmente en momentos de prueba. A través de ejemplos bíblicos y experiencias personales, descubrimos cómo la conexión con Dios a través de la oración puede brindarnos consuelo, esperanza y una fe renovada.',
    imageUrl:
      'https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
    date: '25 Septiembre, 2024',
    datetime: '2024-09-25',
    author: {
      name: 'Juan Pérez',
      imageUrl:
        'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80',
    },
    keywords: 'oración, fe, desafío, paz, Dios',
    ogDescription: 'Descubrí el poder transformador de la oración en los tiempos más difíciles.',
    slug: 'poder-de-la-oracion',
    category: 'Oración',
    quote: '“En los momentos más oscuros, la oración es nuestra luz más brillante.”',
    quoteAuthor: {
      name: 'María López',
      role: 'Pastora',
      imageUrl:
        'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80',
    },
    additionalContent: [
      'La oración nos ayuda a mantenernos conectados con Dios, especialmente en los momentos en que nos sentimos perdidos o abrumados.',
      'Al mirar a las Escrituras, podemos ver el papel crucial que la oración jugó en la vida de Jesús y sus discípulos. Es una herramienta esencial para los creyentes de hoy.',
    ],
  },
  {
    id: 2,
    title: 'La importancia de la comunidad cristiana',
    description:
      'La comunidad cristiana es un pilar fundamental en nuestra fe. En este artículo, exploramos cómo la iglesia es una familia en la que nos apoyamos mutuamente.',
    content:
      'Desde los primeros días de la iglesia, la comunidad cristiana ha sido una parte vital del crecimiento espiritual de los creyentes. Nos apoyamos unos a otros, compartimos nuestras cargas y celebramos nuestras bendiciones. Este artículo examina el rol de la comunidad y cómo podemos fortalecernos mutuamente en nuestra fe.',
    imageUrl:
      'https://images.unsplash.com/photo-1522199710521-72d69614c702?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
    date: '15 Septiembre, 2024',
    datetime: '2024-09-15',
    author: {
      name: 'Carlos Fernández',
      imageUrl:
        'https://images.unsplash.com/photo-1519244703995-f4e0f30006d5?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80',
    },
    keywords: 'comunidad, iglesia, apoyo, fe',
    ogDescription:
      'Explorá el rol fundamental de la comunidad cristiana en el crecimiento espiritual.',
    slug: 'importancia-comunidad-cristiana',
    category: 'Comunidad',
    quote: '“Una comunidad unida es un reflejo del amor de Cristo en la tierra.”',
    quoteAuthor: {
      name: 'Lucas Gómez',
      role: 'Líder de la comunidad',
      imageUrl:
        'https://images.unsplash.com/photo-1527980965255-d3b416303d12?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80',
    },
    additionalContent: [
      'La comunidad cristiana no solo es un lugar de adoración, sino también un espacio donde nos cuidamos y apoyamos mutuamente.',
      'Dios nos llama a vivir en comunión unos con otros, y es en esa unión donde encontramos fortaleza, apoyo y amor.',
    ],
  },
  {
    id: 3,
    title: 'Cómo vivir una vida de servicio',
    description:
      'El servicio es una de las formas más poderosas de vivir nuestra fe. En este artículo, te compartimos ideas sobre cómo servir a Dios y a los demás.',
    content:
      'Jesús nos enseñó que el mayor entre nosotros es aquel que sirve. En este artículo, profundizamos en la idea de vivir una vida dedicada al servicio a los demás, y cómo esto refleja el amor de Cristo en nuestras acciones cotidianas.',
    imageUrl:
      'https://images.unsplash.com/photo-1519125323398-675f0ddb6308?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
    date: '5 Septiembre, 2024',
    datetime: '2024-09-05',
    author: {
      name: 'Ana Martínez',
      imageUrl:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80',
    },
    keywords: 'servicio, Jesús, amor, comunidad, fe',
    ogDescription: 'Descubrí cómo el servicio puede transformar tu vida y la de los demás.',
    slug: 'como-vivir-una-vida-de-servicio',
    category: 'Servicio',
    quote: '“El verdadero amor se demuestra a través del servicio desinteresado a los demás.”',
    quoteAuthor: {
      name: 'Sofía Ramírez',
      role: 'Voluntaria',
      imageUrl:
        'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80',
    },
    additionalContent: [
      'El servicio no solo es un acto de bondad, sino una manifestación directa de nuestra fe en acción.',
      'Cada vez que servimos a alguien, estamos sirviendo a Dios, y en ese acto encontramos un propósito y sentido más profundo en nuestra vida.',
    ],
  },
];

export const fetchDummyBlogPosts = async (): Promise<BlogPost[]> => {
  return dummyBlogPosts;
};

export const fetchDummySinglePost = async (slug: string): Promise<BlogPost | undefined> => {
  return dummyBlogPosts.find(post => post.slug.toString() === slug);
};

export const fetchDummyOtherPosts = async (count: number): Promise<BlogPost[]> => {
  return dummyBlogPosts.slice(0, count);
};
