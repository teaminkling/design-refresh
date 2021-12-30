import {useRouter} from "next/router";

const Artist = () => {
  const router = useRouter();
  const {id} = router.query;

  // First, we need to check that the artist actually exists.

  return (
    <p>Artist: {id}</p>
  );
};

export default Artist;