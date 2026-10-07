import { categoryMeta } from '../../constants/categories';

export default function CategoryBadge({ name }) {
  const meta = categoryMeta(name);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.badge}`}
    >
      {name}
    </span>
  );
}
