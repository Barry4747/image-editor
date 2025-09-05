import { useEffect, useState } from "react";
import { fetchGallery, deleteJob, updateJob } from "../api/gallery";

interface Job {
  id: number;
  output: string;
  title?: string;
  description?: string;
}

export default function GalleryPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [editing, setEditing] = useState<Job | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [viewing, setViewing] = useState<Job | null>(null); 
  const [loading, setLoading] = useState(true);

  async function loadGallery() {
    setLoading(true);
    try {
      const data = await fetchGallery();
      setJobs(data);
    } catch (err) {
      console.error("Failed to load gallery", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    await deleteJob(id);
    setJobs(jobs.filter((j) => j.id !== id));
  }

  async function handleSaveEdit() {
    if (!editing) return;
    const updated = await updateJob(editing.id, {
      title: editTitle,
      description: editDesc,
    });
    setJobs(jobs.map((j) => (j.id === editing.id ? updated : j)));
    setEditing(null);
  }

  useEffect(() => {
    loadGallery();
  }, []);

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800 dark:text-white">
        My Gallery
      </h1>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      ) : jobs.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center py-10">
          No images yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden transform transition duration-300 hover:shadow-xl hover:scale-102 group"
            >
              <div className="relative cursor-zoom-in" onClick={() => setViewing(job)}>
                <img
                  src={job.output}
                  alt={job.title || "Generated image"}
                  className="w-full h-auto object-contain aspect-square"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <span className="text-white font-medium text-sm">View Full</span>
                </div>
              </div>

              <div className="p-3">
                <h3 className="font-semibold text-gray-800 dark:text-white truncate">
                  {job.title || "Untitled"}
                </h3>
                {job.description && (
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                    {job.description}
                  </p>
                )}

                <div className="flex space-x-2 mt-2 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(job);
                      setEditTitle(job.title || "");
                      setEditDesc(job.description || "");
                    }}
                    className="flex-1 text-xs py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(job.id);
                    }}
                    className="flex-1 text-xs py-1 bg-red-600 hover:bg-red-700 text-white rounded transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewing && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setViewing(null)}
        >
          <div className="relative max-w-4xl max-h-full">
            <img
              src={viewing.output}
              alt="Full view"
              className="max-w-full max-h-screen object-contain rounded-lg shadow-2xl"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setViewing(null);
              }}
              className="absolute top-4 right-4 bg-black bg-opacity-50 text-white rounded-full w-10 h-10 flex items-center justify-center text-xl hover:bg-opacity-70 transition"
            >
              ✕
            </button>
            <div className="absolute bottom-4 left-4 right-4 text-white text-center">
              <h4 className="font-bold">{viewing.title || "Untitled"}</h4>
              {viewing.description && (
                <p className="text-sm opacity-90">{viewing.description}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
          <div
            className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">
              Edit Image
            </h2>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Title"
              className="w-full mb-3 p-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-800 dark:text-white"
            />
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Description"
              rows={3}
              className="w-full mb-4 p-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-800 dark:text-white resize-none"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-1.5 rounded bg-gray-300 hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}