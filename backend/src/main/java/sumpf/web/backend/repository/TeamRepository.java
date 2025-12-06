package sumpf.web.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import sumpf.web.backend.entity.Member;
import sumpf.web.backend.entity.Team;

@Repository
public interface TeamRepository extends JpaRepository<Team, Integer> {
}
